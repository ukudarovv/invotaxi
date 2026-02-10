"""
Сервис распределения заказов с продвинутым алгоритмом скоринга
Реализует pipeline: фильтрация → Top-K → скоринг → оффер → таймеры
"""
from typing import List, Optional, Dict, Tuple
from django.utils import timezone
from django.db.models import Q, Count, Avg
from datetime import timedelta
from decimal import Decimal
import logging
import math

from orders.models import Order, OrderStatus, OrderOffer, DispatchConfig
from accounts.models import Driver, DriverStatus, DriverStatistics
from dispatch.services import DispatchEngine
from geo.services import Geo

logger = logging.getLogger(__name__)


class CandidateScore:
    """Результат скоринга кандидата"""
    def __init__(self, driver: Driver, cost: float, details: Dict):
        self.driver = driver
        self.cost = cost
        self.details = details  # ETA, distance, risk_reject, etc.


class MatchingService:
    """Сервис распределения заказов с продвинутым алгоритмом"""
    
    def __init__(self, config: Optional[DispatchConfig] = None):
        self.config = config or DispatchConfig.get_active_config()
        self.dispatch_engine = DispatchEngine()
    
    def assign_order(self, order: Order) -> Dict:
        """
        Главный метод распределения заказа
        Возвращает результат с информацией о назначении или ошибке
        """
        # Проверяем статус заказа
        if order.status not in [OrderStatus.CREATED, OrderStatus.MATCHING, OrderStatus.ACTIVE_QUEUE]:
            return {
                'success': False,
                'error': f'Заказ не в подходящем статусе для распределения: {order.status}'
            }
        
        # Переводим в статус MATCHING
        if order.status != OrderStatus.MATCHING:
            from orders.services import OrderService
            OrderService.update_status(order, OrderStatus.MATCHING, 'Начало поиска водителя')
            order.refresh_from_db()
        
        # Шаг B: Предварительная фильтрация
        candidates = self._filter_candidates(order)
        
        if not candidates:
            # Расширяем поиск
            return self._expand_search(order)
        
        # Шаг C: Top-K по первичному критерию (ETA)
        top_candidates = self._get_top_k_by_eta(candidates, order, self.config.k_candidates)
        
        if not top_candidates:
            return {
                'success': False,
                'error': 'Не удалось рассчитать ETA для кандидатов'
            }
        
        # Шаг D: Скоринг
        scored_candidates = []
        for driver in top_candidates:
            score = self._score_candidate(order, driver)
            if score:
                scored_candidates.append(score)
        
        if not scored_candidates:
            return {
                'success': False,
                'error': 'Не удалось рассчитать скоринг для кандидатов'
            }
        
        # Сортируем по cost (меньше = лучше)
        scored_candidates.sort(key=lambda x: x.cost)
        
        # Шаг E: Выбор стратегии (один заказ сейчас)
        best_candidate = scored_candidates[0]
        
        # Шаг F: Отправка оффера
        return self._send_offer(order, best_candidate)
    
    def _filter_candidates(self, order: Order) -> List[Driver]:
        """
        Шаг B: Предварительная фильтрация (hard constraints)
        Район - это жесткое условие, не фактор приоритета
        """
        seats_needed = order.seats_needed
        
        # Получаем район заказа по координатам pickup
        pickup_region = order.pickup_region
        if not pickup_region:
            # Fallback на район пассажира
            if hasattr(order, 'passenger') and order.passenger and hasattr(order.passenger, 'region'):
                pickup_region = order.passenger.region
                logger.warning(f'Не удалось определить район по координатам для заказа {order.id}, используется район пассажира: {pickup_region}')
            else:
                logger.error(f'Не удалось определить район для заказа {order.id}: нет pickup_region и нет passenger.region')
                return []
        
        logger.debug(f'Фильтрация кандидатов для заказа {order.id}, район: {pickup_region.title}')
        
        # Базовый фильтр: онлайн и свободен
        query = Q(
            is_online=True,
            status__in=[DriverStatus.ONLINE_IDLE, DriverStatus.PAUSED],  # PAUSED можно включить опционально
            capacity__gte=seats_needed
        )
        
        # ЖЕСТКИЙ ФИЛЬТР: район должен совпадать
        query &= Q(region=pickup_region)
        
        candidates_before_region = Driver.objects.filter(
            is_online=True,
            status__in=[DriverStatus.ONLINE_IDLE, DriverStatus.PAUSED],
            capacity__gte=seats_needed
        ).count()
        
        candidates = Driver.objects.filter(query).select_related('statistics', 'region')
        
        candidates_after_region = candidates.count()
        logger.debug(f'Кандидаты до фильтрации по району: {candidates_before_region}, после: {candidates_after_region}')
        
        # Дополнительные проверки
        filtered = []
        for driver in candidates:
            # Проверка: водитель должен иметь заполненный region
            if not driver.region:
                logger.warning(f'Водитель {driver.id} ({driver.name}) пропущен: не заполнен region')
                continue
            
            # Проверка рейтинга
            if driver.rating < self.config.min_rating:
                continue
            
            # Проверка GPS (должна быть свежая позиция)
            if not driver.current_lat or not driver.current_lon:
                continue
            
            # Проверка свежести GPS (не старше 5 минут)
            if driver.last_location_update:
                age = timezone.now() - driver.last_location_update
                if age > timedelta(minutes=5):
                    continue
            
            # Проверка лимита офферов
            stats, _ = DriverStatistics.objects.get_or_create(driver=driver)
            if stats.offers_last_60min >= self.config.max_offers_per_hour:
                continue
            
            filtered.append(driver)
        
        logger.info(f'Для заказа {order.id} найдено кандидатов после фильтрации: {len(filtered)} из {candidates_after_region} (район: {pickup_region.title})')
        
        return filtered
    
    def _get_top_k_by_eta(self, candidates: List[Driver], order: Order, k: int) -> List[Driver]:
        """
        Шаг C: Выбор Top-K кандидатов по ETA до подачи
        """
        candidates_with_eta = []
        
        for driver in candidates:
            try:
                eta_data = self.dispatch_engine.calculate_eta(driver, order)
                if not eta_data:
                    continue
                
                eta_seconds = eta_data['duration_seconds']
                
                # Фильтр по максимальному ETA
                if eta_seconds > self.config.eta_max_seconds:
                    continue
                
                candidates_with_eta.append((driver, eta_seconds))
            except Exception as e:
                logger.warning(f"Ошибка расчета ETA для водителя {driver.id}: {e}")
                continue
        
        # Сортируем по ETA и берем Top-K
        candidates_with_eta.sort(key=lambda x: x[1])
        top_k = [driver for driver, _ in candidates_with_eta[:k]]
        
        return top_k
    
    def _score_candidate(self, order: Order, driver: Driver) -> Optional[CandidateScore]:
        """
        Шаг D: Скоринг кандидата
        Возвращает cost (меньше = лучше)
        """
        try:
            # Получаем статистику водителя
            stats, _ = DriverStatistics.objects.get_or_create(driver=driver)
            
            # Рассчитываем ETA
            eta_data = self.dispatch_engine.calculate_eta(driver, order)
            if not eta_data:
                return None
            
            eta_seconds = eta_data['duration_seconds']
            distance_km = eta_data['distance_km']
            
            # Нормализация метрик (0..1)
            eta_norm = min(eta_seconds / self.config.eta_max_seconds, 1.0)
            
            # Нормализация расстояния (предполагаем максимум 20 км)
            max_distance_km = 20.0
            deadhead_norm = min(distance_km / max_distance_km, 1.0)
            
            # Риск отказа (1 - acceptance_rate)
            reject_norm = 1.0 - stats.acceptance_rate
            
            # Риск отмены
            cancel_norm = stats.cancel_rate
            
            # Fairness penalty
            # Считаем медиану заказов за последний час среди всех водителей
            median_orders = self._get_median_orders_last_hour()
            if median_orders > 0:
                fairness_diff = stats.orders_last_60min - median_orders
                fairness_norm = min(abs(fairness_diff) / 5.0, 1.0)  # Масштаб 5 заказов
            else:
                fairness_norm = 0.0
            
            # Zone balancing (упрощенная версия - можно расширить)
            zone_norm = 0.0  # TODO: реализовать heatmap
            
            # Quality penalty (штраф за низкий рейтинг)
            if driver.rating < 4.5:
                quality_norm = (4.5 - driver.rating) / 1.5  # Нормализация от 0 до 1
            else:
                quality_norm = 0.0
            
            # Расчет cost
            cost = (
                self.config.w_eta * eta_norm +
                self.config.w_deadhead * deadhead_norm +
                self.config.w_reject * reject_norm +
                self.config.w_cancel * cancel_norm +
                self.config.w_fairness * fairness_norm +
                self.config.w_zone * zone_norm +
                self.config.w_quality * quality_norm
            )
            
            details = {
                'eta_seconds': eta_seconds,
                'eta_norm': eta_norm,
                'distance_km': distance_km,
                'deadhead_norm': deadhead_norm,
                'reject_norm': reject_norm,
                'cancel_norm': cancel_norm,
                'fairness_norm': fairness_norm,
                'zone_norm': zone_norm,
                'quality_norm': quality_norm,
                'acceptance_rate': stats.acceptance_rate,
                'cancel_rate': stats.cancel_rate,
                'orders_last_60min': stats.orders_last_60min,
            }
            
            return CandidateScore(driver, cost, details)
            
        except Exception as e:
            logger.error(f"Ошибка скоринга для водителя {driver.id}: {e}")
            return None
    
    def _get_median_orders_last_hour(self) -> float:
        """Получить медиану заказов за последний час"""
        # Упрощенная версия - можно оптимизировать с кешированием
        stats = DriverStatistics.objects.all()
        if not stats.exists():
            return 0.0
        
        orders_list = [s.orders_last_60min for s in stats]
        orders_list.sort()
        n = len(orders_list)
        
        if n == 0:
            return 0.0
        elif n % 2 == 0:
            return (orders_list[n//2 - 1] + orders_list[n//2]) / 2.0
        else:
            return orders_list[n//2]
    
    def _send_offer(self, order: Order, candidate_score: CandidateScore) -> Dict:
        """
        Шаг F: Отправка оффера водителю
        """
        driver = candidate_score.driver
        details = candidate_score.details
        
        # Проверяем, нет ли уже активного оффера для этого заказа
        active_offers = OrderOffer.objects.filter(
            order=order,
            status='pending',
            expires_at__gt=timezone.now()
        )
        
        if active_offers.exists():
            return {
                'success': False,
                'error': 'У заказа уже есть активный оффер'
            }
        
        # Создаем оффер
        expires_at = timezone.now() + timedelta(seconds=self.config.offer_timeout_seconds)
        
        offer = OrderOffer.objects.create(
            order=order,
            driver=driver,
            status='pending',
            expires_at=expires_at,
            eta_seconds=details['eta_seconds'],
            distance_km=details['distance_km'],
            cost_score=candidate_score.cost,
            selection_reason=self._format_selection_reason(candidate_score)
        )
        
        # Обновляем статусы
        from orders.services import OrderService
        OrderService.update_status(
            order,
            OrderStatus.OFFERED,
            f'Предложение отправлено водителю {driver.name}'
        )
        
        # Обновляем статус водителя
        driver.status = DriverStatus.OFFERED
        driver.save()
        
        # Обновляем статистику
        stats, _ = DriverStatistics.objects.get_or_create(driver=driver)
        stats.offers_last_60min += 1
        stats.save()
        
        # TODO: Отправить уведомление через WebSocket или push
        
        logger.info(f"Оффер отправлен: заказ {order.id} -> водитель {driver.id} (cost={candidate_score.cost:.3f})")
        
        return {
            'success': True,
            'offer_id': offer.id,
            'driver_id': driver.id,
            'driver_name': driver.name,
            'eta_seconds': details['eta_seconds'],
            'expires_at': expires_at.isoformat(),
            'cost_score': candidate_score.cost,
            'details': details
        }
    
    def _format_selection_reason(self, score: CandidateScore) -> str:
        """Форматирует причину выбора водителя"""
        details = score.details
        reasons = []
        
        if details['eta_norm'] < 0.3:
            reasons.append(f"быстрый ETA ({details['eta_seconds']}с)")
        if details['reject_norm'] < 0.2:
            reasons.append(f"высокий acceptance rate ({details['acceptance_rate']:.2f})")
        if details['fairness_norm'] < 0.2:
            reasons.append("справедливое распределение")
        if details['quality_norm'] < 0.1:
            reasons.append(f"высокий рейтинг ({score.driver.rating:.1f})")
        
        if not reasons:
            reasons.append("оптимальный баланс факторов")
        
        return ", ".join(reasons)
    
    def _expand_search(self, order: Order) -> Dict:
        """
        Расширение поиска при отсутствии кандидатов
        Увеличивает ETA_max и радиус поиска, НО НЕ расширяет на другие районы
        Район остается жестким условием
        """
        # Получаем район заказа
        pickup_region = order.pickup_region or (order.passenger.region if hasattr(order, 'passenger') and order.passenger else None)
        if not pickup_region:
            return {
                'success': False,
                'error': 'Не удалось определить район заказа для расширения поиска',
                'suggestion': 'Проверьте координаты pickup или регион пассажира'
            }
        
        logger.info(f'Расширение поиска для заказа {order.id} в районе {pickup_region.title} (увеличение ETA, но не расширение на другие районы)')
        
        # Увеличиваем максимальный ETA
        original_eta_max = self.config.eta_max_seconds
        expanded_eta_max = int(original_eta_max * self.config.expand_eta_multiplier)
        
        # Временно меняем конфигурацию
        old_config = self.config
        self.config.eta_max_seconds = expanded_eta_max
        
        # Повторяем поиск (район останется тем же, так как _filter_candidates использует order.pickup_region)
        candidates = self._filter_candidates(order)
        
        # Восстанавливаем конфигурацию
        self.config = old_config
        
        if not candidates:
            return {
                'success': False,
                'error': f'Нет подходящих водителей в районе "{pickup_region.title}" даже после расширения ETA',
                'suggestion': 'Попробуйте позже, когда в этом районе появятся свободные водители'
            }
        
        # Продолжаем с расширенным поиском
        top_candidates = self._get_top_k_by_eta(candidates, order, self.config.k_candidates)
        
        if not top_candidates:
            return {
                'success': False,
                'error': 'Не удалось найти водителей даже после расширения поиска'
            }
        
        scored_candidates = []
        for driver in top_candidates:
            score = self._score_candidate(order, driver)
            if score:
                scored_candidates.append(score)
        
        if not scored_candidates:
            return {
                'success': False,
                'error': 'Не удалось рассчитать скоринг после расширения поиска'
            }
        
        scored_candidates.sort(key=lambda x: x.cost)
        best_candidate = scored_candidates[0]
        
        return self._send_offer(order, best_candidate)
    
    def handle_offer_accepted(self, offer: OrderOffer) -> Dict:
        """Обработка принятия оффера"""
        # Проверяем, что оффер еще активен
        if offer.status != 'pending':
            return {
                'success': False,
                'error': f'Оффер уже обработан (статус: {offer.status})'
            }
        
        if offer.is_expired:
            return {
                'success': False,
                'error': 'Оффер истек'
            }
        
        # Атомарно блокируем заказ (проверяем, что он еще не назначен)
        order = offer.order
        order.refresh_from_db()
        
        if order.status == OrderStatus.ASSIGNED:
            return {
                'success': False,
                'error': 'Заказ уже назначен другому водителю'
            }
        
        # Обновляем статусы
        offer.status = 'accepted'
        offer.responded_at = timezone.now()
        offer.save()
        
        order.driver = offer.driver
        order.assignment_reason = f'Принят оффер: {offer.selection_reason}'
        
        from orders.services import OrderService
        OrderService.update_status(order, OrderStatus.ASSIGNED, order.assignment_reason)
        
        # Обновляем статус водителя
        driver = offer.driver
        driver.status = DriverStatus.ENROUTE_TO_PICKUP
        driver.idle_since = None
        driver.save()
        
        # Обновляем статистику
        stats, _ = DriverStatistics.objects.get_or_create(driver=driver)
        stats.orders_last_60min += 1
        # Пересчитываем acceptance_rate (упрощенная версия)
        total_offers = stats.offers_last_60min
        if total_offers > 0:
            accepted = stats.orders_last_60min
            stats.acceptance_rate = accepted / total_offers
        stats.save()
        
        # Отменяем другие активные офферы для этого заказа
        OrderOffer.objects.filter(
            order=order,
            status='pending'
        ).exclude(driver=driver).update(status='timeout', responded_at=timezone.now())
        
        # Возвращаем других водителей в ONLINE_IDLE
        other_drivers = Driver.objects.filter(
            offers__order=order,
            offers__status='timeout',
            status=DriverStatus.OFFERED
        )
        for other_driver in other_drivers:
            other_driver.status = DriverStatus.ONLINE_IDLE
            other_driver.idle_since = timezone.now()
            other_driver.save()
        
        logger.info(f"Оффер принят: заказ {order.id} -> водитель {driver.id}")
        
        return {
            'success': True,
            'order_id': order.id,
            'driver_id': driver.id,
            'driver_name': driver.name
        }
    
    def handle_offer_declined(self, offer: OrderOffer) -> Dict:
        """Обработка отклонения оффера"""
        if offer.status != 'pending':
            return {
                'success': False,
                'error': f'Оффер уже обработан (статус: {offer.status})'
            }
        
        offer.status = 'declined'
        offer.responded_at = timezone.now()
        offer.save()
        
        # Обновляем статистику водителя
        driver = offer.driver
        stats, _ = DriverStatistics.objects.get_or_create(driver=driver)
        stats.rejections_count += 1
        # Пересчитываем acceptance_rate
        total_offers = stats.offers_last_60min
        if total_offers > 0:
            accepted = stats.orders_last_60min
            stats.acceptance_rate = accepted / total_offers
        stats.save()
        
        # Возвращаем водителя в ONLINE_IDLE
        driver.status = DriverStatus.ONLINE_IDLE
        driver.idle_since = timezone.now()
        driver.save()
        
        # Повторяем поиск для заказа
        order = offer.order
        if order.status == OrderStatus.OFFERED:
            from orders.services import OrderService
            OrderService.update_status(order, OrderStatus.MATCHING, 'Водитель отклонил предложение')
        
        # Повторяем распределение (с штрафом для этого водителя)
        result = self.assign_order(order)
        
        return {
            'success': True,
            'message': 'Оффер отклонен, поиск продолжается',
            'reassignment': result
        }
    
    def handle_offer_timeout(self, offer: OrderOffer) -> Dict:
        """Обработка таймаута оффера"""
        if offer.status != 'pending':
            return {
                'success': False,
                'error': f'Оффер уже обработан (статус: {offer.status})'
            }
        
        if not offer.is_expired:
            return {
                'success': False,
                'error': 'Оффер еще не истек'
            }
        
        offer.status = 'timeout'
        offer.responded_at = timezone.now()
        offer.save()
        
        # Обновляем статистику (как отклонение)
        driver = offer.driver
        stats, _ = DriverStatistics.objects.get_or_create(driver=driver)
        stats.rejections_count += 1
        if stats.offers_last_60min > 0:
            accepted = stats.orders_last_60min
            stats.acceptance_rate = accepted / stats.offers_last_60min
        stats.save()
        
        # Возвращаем водителя в ONLINE_IDLE
        driver.status = DriverStatus.ONLINE_IDLE
        driver.idle_since = timezone.now()
        driver.save()
        
        # Повторяем поиск для заказа
        order = offer.order
        if order.status == OrderStatus.OFFERED:
            from orders.services import OrderService
            OrderService.update_status(order, OrderStatus.MATCHING, 'Таймаут оффера')
        
        # Повторяем распределение
        result = self.assign_order(order)
        
        return {
            'success': True,
            'message': 'Оффер истек, поиск продолжается',
            'reassignment': result
        }
    
    def get_candidates_with_scores(self, order: Order, limit: int = 10) -> List[Dict]:
        """
        Получить список кандидатов с детальными скорингами (для админки/аналитики)
        """
        candidates = self._filter_candidates(order)
        top_candidates = self._get_top_k_by_eta(candidates, order, self.config.k_candidates)
        
        scored = []
        for driver in top_candidates:
            score = self._score_candidate(order, driver)
            if score:
                scored.append({
                    'driver_id': driver.id,
                    'driver_name': driver.name,
                    'car_model': driver.car_model,
                    'rating': driver.rating,
                    'cost': score.cost,
                    'details': score.details
                })
        
        scored.sort(key=lambda x: x['cost'])
        return scored[:limit]
