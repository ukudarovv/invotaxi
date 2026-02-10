from django.utils import timezone
from django.db.models import (
    Count, Sum, Avg, Q, F, DecimalField, IntegerField,
    Case, When, Value, CharField
)
from django.db.models.functions import TruncHour, TruncDay, TruncWeek, TruncMonth, ExtractHour
from decimal import Decimal
from datetime import timedelta
import csv
import logging
from io import StringIO
from typing import Optional, Dict, List, Any
from orders.models import Order, OrderStatus
from accounts.models import Driver, DriverStatistics, Passenger
from regions.models import Region


class MetricsAggregator:
    """Класс для агрегации метрик аналитики"""
    
    @staticmethod
    def get_date_range(date_from: Optional[str] = None, date_to: Optional[str] = None):
        """Получить диапазон дат с дефолтными значениями"""
        if date_from:
            date_from = timezone.datetime.fromisoformat(date_from.replace('Z', '+00:00'))
        else:
            date_from = timezone.now() - timedelta(days=30)
        
        if date_to:
            date_to = timezone.datetime.fromisoformat(date_to.replace('Z', '+00:00'))
        else:
            date_to = timezone.now()
        
        return date_from, date_to
    
    @staticmethod
    def get_order_metrics(date_from: Optional[str] = None, date_to: Optional[str] = None, 
                         region_id: Optional[str] = None) -> Dict[str, Any]:
        """Метрики заказов"""
        date_from, date_to = MetricsAggregator.get_date_range(date_from, date_to)
        
        queryset = Order.objects.filter(
            created_at__gte=date_from,
            created_at__lte=date_to
        )
        
        if region_id:
            queryset = queryset.filter(passenger__region_id=region_id)
        
        total_orders = queryset.count()
        completed_orders = queryset.filter(status=OrderStatus.COMPLETED).count()
        cancelled_orders = queryset.filter(status=OrderStatus.CANCELLED).count()
        
        success_rate = (completed_orders / total_orders * 100) if total_orders > 0 else 0
        
        # Среднее время выполнения (от создания до завершения)
        completed_with_times = queryset.filter(
            status=OrderStatus.COMPLETED,
            completed_at__isnull=False
        )
        
        avg_duration_minutes = None
        if completed_with_times.exists():
            durations = []
            for order in completed_with_times:
                if order.completed_at and order.created_at:
                    duration = (order.completed_at - order.created_at).total_seconds() / 60
                    durations.append(duration)
            if durations:
                avg_duration_minutes = sum(durations) / len(durations)
        
        # Распределение по статусам
        status_distribution = queryset.values('status').annotate(
            count=Count('id')
        ).order_by('-count')
        
        # Среднее расстояние
        avg_distance = queryset.filter(
            distance_km__isnull=False
        ).aggregate(
            avg=Avg('distance_km')
        )['avg'] or 0
        
        # Среднее время ожидания водителя (от создания до назначения)
        avg_assignment_time_minutes = None
        assigned_orders = queryset.filter(
            assigned_at__isnull=False,
            created_at__isnull=False
        )
        if assigned_orders.exists():
            assignment_times = []
            for order in assigned_orders:
                if order.assigned_at and order.created_at:
                    time_diff = (order.assigned_at - order.created_at).total_seconds() / 60
                    assignment_times.append(time_diff)
            if assignment_times:
                avg_assignment_time_minutes = sum(assignment_times) / len(assignment_times)
        
        # Распределение по категориям инвалидности
        disability_distribution = queryset.values(
            'passenger__disability_category'
        ).annotate(
            count=Count('id')
        ).order_by('-count')
        
        # Метрики по surge pricing
        orders_with_surge = queryset.filter(
            quote_surge_multiplier__isnull=False,
            quote_surge_multiplier__gt=1.0
        ).count()
        avg_surge_multiplier = queryset.filter(
            quote_surge_multiplier__isnull=False
        ).aggregate(
            avg=Avg('quote_surge_multiplier')
        )['avg'] or 1.0
        
        return {
            'total_orders': total_orders,
            'completed_orders': completed_orders,
            'cancelled_orders': cancelled_orders,
            'success_rate': round(success_rate, 2),
            'avg_duration_minutes': round(avg_duration_minutes, 2) if avg_duration_minutes else None,
            'avg_distance_km': round(avg_distance, 2) if avg_distance else None,
            'avg_assignment_time_minutes': round(avg_assignment_time_minutes, 2) if avg_assignment_time_minutes else None,
            'status_distribution': list(status_distribution),
            'disability_distribution': list(disability_distribution),
            'orders_with_surge': orders_with_surge,
            'avg_surge_multiplier': round(float(avg_surge_multiplier), 2),
        }
    
    @staticmethod
    def get_financial_metrics(date_from: Optional[str] = None, date_to: Optional[str] = None,
                             region_id: Optional[str] = None) -> Dict[str, Any]:
        """Финансовая аналитика"""
        date_from, date_to = MetricsAggregator.get_date_range(date_from, date_to)
        
        queryset = Order.objects.filter(
            created_at__gte=date_from,
            created_at__lte=date_to,
            status=OrderStatus.COMPLETED
        ).select_related('passenger', 'passenger__region')
        
        if region_id:
            queryset = queryset.filter(passenger__region_id=region_id)
        
        # Выручка
        total_revenue = queryset.aggregate(
            total=Sum('final_price', output_field=DecimalField())
        )['total'] or Decimal('0')
        
        # Средний чек
        completed_count = queryset.count()
        avg_order_value = total_revenue / completed_count if completed_count > 0 else Decimal('0')
        
        # Средняя предварительная цена (quote)
        avg_quote = queryset.aggregate(
            avg=Avg('quote', output_field=DecimalField())
        )['avg'] or Decimal('0')
        
        # Средняя финальная цена
        avg_final_price = queryset.aggregate(
            avg=Avg('final_price', output_field=DecimalField())
        )['avg'] or Decimal('0')
        
        return {
            'total_revenue': float(total_revenue),
            'avg_order_value': float(avg_order_value),
            'avg_quote': float(avg_quote),
            'avg_final_price': float(avg_final_price),
            'completed_orders_count': completed_count,
        }
    
    @staticmethod
    def get_driver_metrics(date_from: Optional[str] = None, date_to: Optional[str] = None,
                          driver_id: Optional[int] = None) -> Dict[str, Any]:
        """Метрики водителей"""
        date_from, date_to = MetricsAggregator.get_date_range(date_from, date_to)
        
        queryset = Order.objects.filter(
            created_at__gte=date_from,
            created_at__lte=date_to,
            driver__isnull=False
        ).select_related('driver', 'driver__user')
        
        if driver_id:
            queryset = queryset.filter(driver_id=driver_id)
        
        # Онлайн водители
        online_drivers = Driver.objects.filter(is_online=True).count()
        
        # Активные водители (с заказами за период)
        active_drivers = queryset.values('driver_id').distinct().count()
        
        # Средний рейтинг водителей
        avg_rating = Driver.objects.filter(
            orders__in=queryset
        ).aggregate(
            avg=Avg('rating')
        )['avg'] or 0
        
        return {
            'online_drivers': online_drivers,
            'active_drivers': active_drivers,
            'avg_rating': round(avg_rating, 2) if avg_rating else 0,
        }
    
    @staticmethod
    def get_time_series_data(date_from: Optional[str] = None, date_to: Optional[str] = None,
                             granularity: str = 'day', region_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Временные ряды данных"""
        date_from, date_to = MetricsAggregator.get_date_range(date_from, date_to)
        
        queryset = Order.objects.filter(
            created_at__gte=date_from,
            created_at__lte=date_to
        )
        
        if region_id:
            queryset = queryset.filter(passenger__region_id=region_id)
        
        # Выбор функции группировки по времени
        if granularity == 'hour':
            trunc_func = TruncHour('created_at')
        elif granularity == 'week':
            trunc_func = TruncWeek('created_at')
        elif granularity == 'month':
            trunc_func = TruncMonth('created_at')
        else:  # day
            trunc_func = TruncDay('created_at')
        
        # Агрегация по времени
        time_series = queryset.annotate(
            time_period=trunc_func
        ).values('time_period').annotate(
            total=Count('id'),
            completed=Count('id', filter=Q(status=OrderStatus.COMPLETED)),
            cancelled=Count('id', filter=Q(status=OrderStatus.CANCELLED)),
            revenue=Sum('final_price', filter=Q(status=OrderStatus.COMPLETED), output_field=DecimalField())
        ).order_by('time_period')
        
        result = []
        for item in time_series:
            result.append({
                'period': item['time_period'].isoformat() if item['time_period'] else None,
                'total': item['total'],
                'completed': item['completed'],
                'cancelled': item['cancelled'],
                'revenue': float(item['revenue'] or 0),
            })
        
        return result
    
    @staticmethod
    def get_region_distribution(date_from: Optional[str] = None, date_to: Optional[str] = None) -> List[Dict[str, Any]]:
        """Распределение по регионам"""
        try:
            date_from, date_to = MetricsAggregator.get_date_range(date_from, date_to)
            
            queryset = Order.objects.filter(
                created_at__gte=date_from,
                created_at__lte=date_to
            ).select_related('passenger', 'passenger__region')
            
            distribution = queryset.values(
                'passenger__region__id',
                'passenger__region__title'
            ).annotate(
                orders_count=Count('id'),
                completed_count=Count('id', filter=Q(status=OrderStatus.COMPLETED)),
                revenue=Sum('final_price', filter=Q(status=OrderStatus.COMPLETED), output_field=DecimalField())
            ).order_by('-orders_count')
            
            result = []
            for item in distribution:
                region_id = item.get('passenger__region__id')
                region_title = item.get('passenger__region__title')
                
                result.append({
                    'region_id': region_id if region_id is not None else '',
                    'region_title': region_title if region_title else 'Не указан',
                    'orders_count': item.get('orders_count', 0),
                    'completed_count': item.get('completed_count', 0),
                    'revenue': float(item.get('revenue') or 0),
                })
            
            return result
        except Exception as e:
            logger.error(f"Error in get_region_distribution: {str(e)}", exc_info=True)
            return []
    
    @staticmethod
    def get_peak_hours(date_from: Optional[str] = None, date_to: Optional[str] = None,
                      region_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Пиковые часы загруженности"""
        date_from, date_to = MetricsAggregator.get_date_range(date_from, date_to)
        
        queryset = Order.objects.filter(
            created_at__gte=date_from,
            created_at__lte=date_to
        )
        
        if region_id:
            queryset = queryset.filter(passenger__region_id=region_id)
        
        # Группировка по часам
        peak_hours = queryset.annotate(
            hour=ExtractHour('created_at')
        ).values('hour').annotate(
            orders_count=Count('id')
        ).order_by('hour')
        
        result = []
        for item in peak_hours:
            hour = int(item['hour'])
            result.append({
                'hour': f"{hour:02d}:00",
                'orders': item['orders_count'],
            })
        
        return result
    
    @staticmethod
    def get_driver_performance(date_from: Optional[str] = None, date_to: Optional[str] = None,
                              limit: int = 10) -> List[Dict[str, Any]]:
        """Топ водители по производительности"""
        date_from, date_to = MetricsAggregator.get_date_range(date_from, date_to)
        
        queryset = Order.objects.filter(
            created_at__gte=date_from,
            created_at__lte=date_to,
            driver__isnull=False,
            status=OrderStatus.COMPLETED
        )
        
        performance = queryset.values(
            'driver__id',
            'driver__name',
            'driver__rating'
        ).annotate(
            orders_count=Count('id'),
            total_revenue=Sum('final_price', output_field=DecimalField())
        ).order_by('-orders_count')[:limit]
        
        # Получаем метрики по офферам для каждого водителя
        from orders.models import OrderOffer
        
        result = []
        for item in performance:
            driver_id = item['driver__id']
            
            # Статистика по офферам
            offers = OrderOffer.objects.filter(
                driver_id=driver_id,
                created_at__gte=date_from,
                created_at__lte=date_to
            )
            total_offers = offers.count()
            accepted_offers = offers.filter(status='accepted').count()
            declined_offers = offers.filter(status='declined').count()
            acceptance_rate = (accepted_offers / total_offers * 100) if total_offers > 0 else 0
            
            result.append({
                'driver_id': driver_id,
                'driver_name': item['driver__name'],
                'rating': float(item['driver__rating'] or 0),
                'orders': item['orders_count'],
                'revenue': float(item['total_revenue'] or 0),
                'total_offers': total_offers,
                'accepted_offers': accepted_offers,
                'declined_offers': declined_offers,
                'acceptance_rate': round(acceptance_rate, 2),
            })
        
        return result
    
    @staticmethod
    def get_comparison_metrics(date_from: Optional[str] = None, date_to: Optional[str] = None,
                               region_id: Optional[str] = None) -> Dict[str, Any]:
        """Сравнение метрик текущего периода с предыдущим"""
        try:
            date_from_obj, date_to_obj = MetricsAggregator.get_date_range(date_from, date_to)
            
            # Текущий период - передаем datetime объекты напрямую в методы
            # Но методы ожидают строки, поэтому преобразуем обратно
            date_from_str = date_from_obj.isoformat()
            date_to_str = date_to_obj.isoformat()
            
            current_metrics = MetricsAggregator.get_order_metrics(
                date_from_str,
                date_to_str,
                region_id
            )
            current_financial = MetricsAggregator.get_financial_metrics(
                date_from_str,
                date_to_str,
                region_id
            )
            
            # Предыдущий период (такой же по длительности)
            period_duration = date_to_obj - date_from_obj
            prev_date_to_obj = date_from_obj - timedelta(seconds=1)
            prev_date_from_obj = prev_date_to_obj - period_duration
            
            prev_date_from_str = prev_date_from_obj.isoformat()
            prev_date_to_str = prev_date_to_obj.isoformat()
            
            prev_metrics = MetricsAggregator.get_order_metrics(
                prev_date_from_str,
                prev_date_to_str,
                region_id
            )
            prev_financial = MetricsAggregator.get_financial_metrics(
                prev_date_from_str,
                prev_date_to_str,
                region_id
            )
            
            # Расчет изменений в процентах
            def calc_change(current, previous):
                if previous == 0:
                    return 100.0 if current > 0 else 0.0
                return ((current - previous) / previous) * 100
            
            return {
                'current': {
                    'orders': current_metrics['total_orders'],
                    'completed': current_metrics['completed_orders'],
                    'revenue': current_financial['total_revenue'],
                    'avg_order_value': current_financial['avg_order_value'],
                },
                'previous': {
                    'orders': prev_metrics['total_orders'],
                    'completed': prev_metrics['completed_orders'],
                    'revenue': prev_financial['total_revenue'],
                    'avg_order_value': prev_financial['avg_order_value'],
                },
                'changes': {
                    'orders': round(calc_change(current_metrics['total_orders'], prev_metrics['total_orders']), 1),
                    'completed': round(calc_change(current_metrics['completed_orders'], prev_metrics['completed_orders']), 1),
                    'revenue': round(calc_change(current_financial['total_revenue'], prev_financial['total_revenue']), 1),
                    'avg_order_value': round(calc_change(current_financial['avg_order_value'], prev_financial['avg_order_value']), 1),
                }
            }
        except Exception as e:
            # Return empty comparison data if there's an error
            import traceback
            logger = logging.getLogger(__name__)
            logger.error(f"Error in get_comparison_metrics: {str(e)}\n{traceback.format_exc()}")
            return {
                'current': {
                    'orders': 0,
                    'completed': 0,
                    'revenue': 0.0,
                    'avg_order_value': 0.0,
                },
                'previous': {
                    'orders': 0,
                    'completed': 0,
                    'revenue': 0.0,
                    'avg_order_value': 0.0,
                },
                'changes': {
                    'orders': 0.0,
                    'completed': 0.0,
                    'revenue': 0.0,
                    'avg_order_value': 0.0,
                }
            }


class CSVExportService:
    """Сервис для экспорта отчетов в CSV"""
    
    @staticmethod
    def export_orders_report(date_from: Optional[str] = None, date_to: Optional[str] = None,
                           region_id: Optional[str] = None) -> StringIO:
        """Экспорт отчета по заказам"""
        date_from, date_to = MetricsAggregator.get_date_range(date_from, date_to)
        
        queryset = Order.objects.filter(
            created_at__gte=date_from,
            created_at__lte=date_to
        ).select_related('passenger', 'driver', 'passenger__region')
        
        if region_id:
            queryset = queryset.filter(passenger__region_id=region_id)
        
        output = StringIO()
        # Добавляем BOM для правильного отображения кириллицы в Excel
        output.write('\ufeff')
        writer = csv.writer(output)
        
        # Заголовки
        writer.writerow([
            'ID заказа',
            'Дата создания',
            'Пассажир',
            'Водитель',
            'Регион',
            'Статус',
            'Адрес отправления',
            'Адрес назначения',
            'Расстояние (км)',
            'Предварительная цена',
            'Финальная цена',
            'Дата завершения'
        ])
        
        # Данные
        for order in queryset:
            writer.writerow([
                order.id,
                order.created_at.strftime('%Y-%m-%d %H:%M:%S') if order.created_at else '',
                order.passenger.full_name if order.passenger else '',
                order.driver.name if order.driver else 'Не назначен',
                order.passenger.region.title if order.passenger and order.passenger.region else '',
                order.get_status_display(),
                order.pickup_title,
                order.dropoff_title,
                order.distance_km or '',
                float(order.quote) if order.quote else '',
                float(order.final_price) if order.final_price else '',
                order.completed_at.strftime('%Y-%m-%d %H:%M:%S') if order.completed_at else '',
            ])
        
        output.seek(0)
        return output
    
    @staticmethod
    def export_financial_report(date_from: Optional[str] = None, date_to: Optional[str] = None,
                               region_id: Optional[str] = None) -> StringIO:
        """Экспорт финансового отчета"""
        date_from, date_to = MetricsAggregator.get_date_range(date_from, date_to)
        
        queryset = Order.objects.filter(
            created_at__gte=date_from,
            created_at__lte=date_to,
            status=OrderStatus.COMPLETED
        ).select_related('passenger__region')
        
        if region_id:
            queryset = queryset.filter(passenger__region_id=region_id)
        
        output = StringIO()
        # Добавляем BOM для правильного отображения кириллицы в Excel
        output.write('\ufeff')
        writer = csv.writer(output)
        
        # Заголовки
        writer.writerow([
            'Дата',
            'Регион',
            'Количество заказов',
            'Общая выручка',
            'Средний чек',
            'Средняя предварительная цена',
            'Средняя финальная цена'
        ])
        
        # Группировка по дням и регионам
        daily_stats = queryset.annotate(
            date=TruncDay('created_at')
        ).values('date', 'passenger__region__title').annotate(
            orders_count=Count('id'),
            total_revenue=Sum('final_price', output_field=DecimalField()),
            avg_quote=Avg('quote', output_field=DecimalField()),
            avg_final=Avg('final_price', output_field=DecimalField())
        ).order_by('date', 'passenger__region__title')
        
        for stat in daily_stats:
            orders_count = stat['orders_count']
            total_revenue = float(stat['total_revenue'] or 0)
            avg_order_value = total_revenue / orders_count if orders_count > 0 else 0
            
            writer.writerow([
                stat['date'].strftime('%Y-%m-%d') if stat['date'] else '',
                stat['passenger__region__title'] or 'Не указан',
                orders_count,
                total_revenue,
                round(avg_order_value, 2),
                float(stat['avg_quote'] or 0),
                float(stat['avg_final'] or 0),
            ])
        
        output.seek(0)
        return output
    
    @staticmethod
    def export_driver_report(date_from: Optional[str] = None, date_to: Optional[str] = None) -> StringIO:
        """Экспорт отчета по водителям"""
        date_from, date_to = MetricsAggregator.get_date_range(date_from, date_to)
        
        queryset = Order.objects.filter(
            created_at__gte=date_from,
            created_at__lte=date_to,
            driver__isnull=False
        ).select_related('driver', 'driver__region')
        
        output = StringIO()
        # Добавляем BOM для правильного отображения кириллицы в Excel
        output.write('\ufeff')
        writer = csv.writer(output)
        
        # Заголовки
        writer.writerow([
            'Водитель',
            'Регион',
            'Телефон',
            'Рейтинг',
            'Всего заказов',
            'Выполнено',
            'Отменено',
            'Общая выручка',
            'Средний чек'
        ])
        
        # Группировка по водителям
        driver_stats = queryset.values(
            'driver__id',
            'driver__name',
            'driver__region__title',
            'driver__user__phone',
            'driver__rating'
        ).annotate(
            total_orders=Count('id'),
            completed_orders=Count('id', filter=Q(status=OrderStatus.COMPLETED)),
            cancelled_orders=Count('id', filter=Q(status=OrderStatus.CANCELLED)),
            total_revenue=Sum('final_price', filter=Q(status=OrderStatus.COMPLETED), output_field=DecimalField())
        ).order_by('-total_orders')
        
        for stat in driver_stats:
            completed = stat['completed_orders']
            revenue = float(stat['total_revenue'] or 0)
            avg_order_value = revenue / completed if completed > 0 else 0
            
            writer.writerow([
                stat['driver__name'],
                stat['driver__region__title'] or 'Не указан',
                stat['driver__user__phone'] or '',
                float(stat['driver__rating'] or 0),
                stat['total_orders'],
                completed,
                stat['cancelled_orders'],
                revenue,
                round(avg_order_value, 2),
            ])
        
        output.seek(0)
        return output
