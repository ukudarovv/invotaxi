"""
Команда для тестирования алгоритма распределения
"""
from django.core.management.base import BaseCommand
from orders.models import Order, OrderStatus
from dispatch.matching_service import MatchingService
from accounts.models import Driver, DriverStatus


class Command(BaseCommand):
    help = 'Тестирование алгоритма распределения заказов'

    def add_arguments(self, parser):
        parser.add_argument(
            '--order-id',
            type=str,
            help='ID заказа для тестирования',
        )
        parser.add_argument(
            '--show-candidates',
            action='store_true',
            help='Показать кандидатов с детальными скорингами',
        )

    def handle(self, *args, **options):
        order_id = options.get('order_id')
        
        if not order_id:
            # Находим первый заказ в статусе MATCHING или ACTIVE_QUEUE
            order = Order.objects.filter(
                status__in=[OrderStatus.MATCHING, OrderStatus.ACTIVE_QUEUE]
            ).first()
            
            if not order:
                self.stdout.write(
                    self.style.ERROR('Нет заказов для тестирования. Создайте заказ в статусе MATCHING или ACTIVE_QUEUE.')
                )
                return
            
            order_id = order.id
            self.stdout.write(f'Используется заказ: {order_id}')
        
        try:
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            self.stdout.write(self.style.ERROR(f'Заказ {order_id} не найден'))
            return
        
        matching_service = MatchingService()
        
        # Показываем кандидатов с скорингом
        if options.get('show_candidates'):
            self.stdout.write(self.style.SUCCESS(f'\nКандидаты для заказа {order_id}:\n'))
            candidates = matching_service.get_candidates_with_scores(order, limit=10)
            
            for i, candidate in enumerate(candidates, 1):
                self.stdout.write(f'\n{i}. {candidate["driver_name"]} ({candidate["car_model"]})')
                self.stdout.write(f'   Cost: {candidate["cost"]:.4f}')
                self.stdout.write(f'   ETA: {candidate["details"]["eta_seconds"]}с ({candidate["details"]["eta_norm"]:.2f})')
                self.stdout.write(f'   Distance: {candidate["details"]["distance_km"]:.2f} км')
                self.stdout.write(f'   Acceptance Rate: {candidate["details"]["acceptance_rate"]:.2f}')
                self.stdout.write(f'   Rating: {candidate["rating"]:.1f}')
                self.stdout.write(f'   Orders (last 60min): {candidate["details"]["orders_last_60min"]}')
        
        # Пытаемся назначить заказ
        self.stdout.write(self.style.SUCCESS(f'\nПопытка назначения заказа {order_id}...\n'))
        result = matching_service.assign_order(order)
        
        if result.get('success'):
            self.stdout.write(self.style.SUCCESS('✓ Заказ успешно назначен!'))
            self.stdout.write(f'  Водитель: {result["driver_name"]} (ID: {result["driver_id"]})')
            self.stdout.write(f'  ETA: {result["eta_seconds"]} секунд')
            self.stdout.write(f'  Cost Score: {result["cost_score"]:.4f}')
            self.stdout.write(f'  Offer ID: {result["offer_id"]}')
            self.stdout.write(f'  Expires at: {result["expires_at"]}')
            
            if result.get('details'):
                self.stdout.write('\nДетали скоринга:')
                for key, value in result['details'].items():
                    if isinstance(value, float):
                        self.stdout.write(f'  {key}: {value:.4f}')
                    else:
                        self.stdout.write(f'  {key}: {value}')
        else:
            self.stdout.write(self.style.ERROR('✗ Не удалось назначить заказ'))
            self.stdout.write(f'  Ошибка: {result.get("error", "Неизвестная ошибка")}')
            
            if result.get('suggestion'):
                self.stdout.write(f'  Предложение: {result["suggestion"]}')
