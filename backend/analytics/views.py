from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.http import HttpResponse
import logging
from .services import MetricsAggregator, CSVExportService
from .serializers import (
    MetricsSerializer, FinancialMetricsSerializer, DriverMetricsSerializer,
    TimeSeriesDataSerializer, RegionDistributionSerializer,
    PeakHoursSerializer, DriverPerformanceSerializer
)

logger = logging.getLogger(__name__)


class AnalyticsViewSet(viewsets.ViewSet):
    """ViewSet для аналитики"""
    permission_classes = [IsAuthenticated]
    # Empty queryset for router URL generation (not used since we only have custom actions)
    queryset = None
    
    def _get_query_params(self):
        """Получить параметры запроса"""
        region_id = self.request.query_params.get('region_id')
        driver_id = self.request.query_params.get('driver_id')
        
        # region_id может быть строкой (CharField primary key в Region модели)
        # Оставляем как есть, если передан
        
        # Безопасное преобразование driver_id в int
        if driver_id:
            try:
                driver_id = int(driver_id)
            except (ValueError, TypeError):
                driver_id = None
        
        return {
            'date_from': self.request.query_params.get('date_from'),
            'date_to': self.request.query_params.get('date_to'),
            'region_id': region_id,  # Может быть строкой или None
            'driver_id': driver_id,
            'granularity': self.request.query_params.get('granularity', 'day'),
        }
    
    @action(detail=False, methods=['get'])
    def metrics(self, request):
        """Основные метрики (KPI)"""
        params = self._get_query_params()
        metrics = MetricsAggregator.get_order_metrics(
            date_from=params['date_from'],
            date_to=params['date_to'],
            region_id=params['region_id']
        )
        
        # Добавляем метрики водителей
        driver_metrics = MetricsAggregator.get_driver_metrics(
            date_from=params['date_from'],
            date_to=params['date_to'],
            driver_id=params['driver_id']
        )
        metrics.update(driver_metrics)
        
        # Добавляем финансовые метрики
        financial_metrics = MetricsAggregator.get_financial_metrics(
            date_from=params['date_from'],
            date_to=params['date_to'],
            region_id=params['region_id']
        )
        metrics.update(financial_metrics)
        
        serializer = MetricsSerializer(metrics)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def orders(self, request):
        """Аналитика заказов"""
        params = self._get_query_params()
        metrics = MetricsAggregator.get_order_metrics(
            date_from=params['date_from'],
            date_to=params['date_to'],
            region_id=params['region_id']
        )
        serializer = MetricsSerializer(metrics)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def financial(self, request):
        """Финансовая аналитика"""
        params = self._get_query_params()
        metrics = MetricsAggregator.get_financial_metrics(
            date_from=params['date_from'],
            date_to=params['date_to'],
            region_id=params['region_id']
        )
        serializer = FinancialMetricsSerializer(metrics)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def drivers(self, request):
        """Аналитика водителей"""
        params = self._get_query_params()
        metrics = MetricsAggregator.get_driver_metrics(
            date_from=params['date_from'],
            date_to=params['date_to'],
            driver_id=params['driver_id']
        )
        serializer = DriverMetricsSerializer(metrics)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def time_series(self, request):
        """Временные ряды"""
        try:
            params = self._get_query_params()
            data = MetricsAggregator.get_time_series_data(
                date_from=params['date_from'],
                date_to=params['date_to'],
                granularity=params['granularity'],
                region_id=params['region_id']
            )
            serializer = TimeSeriesDataSerializer(data, many=True)
            return Response(serializer.data)
        except Exception as e:
            logger.error(f"Error in time_series endpoint: {str(e)}", exc_info=True)
            return Response(
                {'error': f'Ошибка при получении временных рядов: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'])
    def regions(self, request):
        """Распределение по регионам"""
        try:
            # Безопасно получаем параметры запроса
            date_from = request.query_params.get('date_from')
            date_to = request.query_params.get('date_to')
            
            # Игнорируем region_id, если он передан (метод не использует фильтрацию по региону)
            # Это предотвращает ошибки, если фронтенд передает некорректный region_id
            
            data = MetricsAggregator.get_region_distribution(
                date_from=date_from,
                date_to=date_to
            )
            serializer = RegionDistributionSerializer(data, many=True)
            return Response(serializer.data)
        except Exception as e:
            logger.error(f"Error in regions endpoint: {str(e)}", exc_info=True)
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            return Response(
                {'error': f'Ошибка при получении распределения по регионам: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'])
    def peak_hours(self, request):
        """Пиковые часы"""
        try:
            params = self._get_query_params()
            data = MetricsAggregator.get_peak_hours(
                date_from=params['date_from'],
                date_to=params['date_to'],
                region_id=params['region_id']
            )
            serializer = PeakHoursSerializer(data, many=True)
            return Response(serializer.data)
        except Exception as e:
            logger.error(f"Error in peak_hours endpoint: {str(e)}", exc_info=True)
            return Response(
                {'error': f'Ошибка при получении пиковых часов: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'])
    def driver_performance(self, request):
        """Топ водители"""
        try:
            params = self._get_query_params()
            limit = int(request.query_params.get('limit', 10))
            data = MetricsAggregator.get_driver_performance(
                date_from=params['date_from'],
                date_to=params['date_to'],
                limit=limit
            )
            serializer = DriverPerformanceSerializer(data, many=True)
            return Response(serializer.data)
        except Exception as e:
            logger.error(f"Error in driver_performance endpoint: {str(e)}", exc_info=True)
            return Response(
                {'error': f'Ошибка при получении производительности водителей: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'])
    def comparison(self, request):
        """Сравнение метрик текущего периода с предыдущим"""
        try:
            params = self._get_query_params()
            data = MetricsAggregator.get_comparison_metrics(
                date_from=params['date_from'],
                date_to=params['date_to'],
                region_id=params['region_id']
            )
            return Response(data)
        except Exception as e:
            logger.error(f"Error in comparison endpoint: {str(e)}", exc_info=True)
            return Response(
                {'error': f'Ошибка при получении сравнения метрик: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'])
    def export(self, request):
        """Экспорт отчетов в CSV"""
        report_type = request.query_params.get('type', 'orders')
        params = self._get_query_params()
        
        region_id = params['region_id']
        
        if report_type == 'orders':
            csv_data = CSVExportService.export_orders_report(
                date_from=params['date_from'],
                date_to=params['date_to'],
                region_id=region_id
            )
            filename = 'orders_report.csv'
        elif report_type == 'financial':
            csv_data = CSVExportService.export_financial_report(
                date_from=params['date_from'],
                date_to=params['date_to'],
                region_id=region_id
            )
            filename = 'financial_report.csv'
        elif report_type == 'drivers':
            csv_data = CSVExportService.export_driver_report(
                date_from=params['date_from'],
                date_to=params['date_to']
            )
            filename = 'drivers_report.csv'
        else:
            return Response(
                {'error': 'Неверный тип отчета. Доступны: orders, financial, drivers'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        response = HttpResponse(csv_data.getvalue(), content_type='text/csv; charset=utf-8-sig')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
