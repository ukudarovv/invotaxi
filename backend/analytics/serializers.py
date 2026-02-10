from rest_framework import serializers


class MetricsSerializer(serializers.Serializer):
    """Сериализатор основных метрик"""
    total_orders = serializers.IntegerField()
    completed_orders = serializers.IntegerField()
    cancelled_orders = serializers.IntegerField()
    success_rate = serializers.FloatField()
    avg_duration_minutes = serializers.FloatField(allow_null=True)
    status_distribution = serializers.ListField()


class FinancialMetricsSerializer(serializers.Serializer):
    """Сериализатор финансовых метрик"""
    total_revenue = serializers.FloatField()
    avg_order_value = serializers.FloatField()
    avg_quote = serializers.FloatField()
    avg_final_price = serializers.FloatField()
    completed_orders_count = serializers.IntegerField()


class DriverMetricsSerializer(serializers.Serializer):
    """Сериализатор метрик водителей"""
    online_drivers = serializers.IntegerField()
    active_drivers = serializers.IntegerField()
    avg_rating = serializers.FloatField()


class TimeSeriesDataSerializer(serializers.Serializer):
    """Сериализатор временных рядов"""
    period = serializers.CharField()
    total = serializers.IntegerField()
    completed = serializers.IntegerField()
    cancelled = serializers.IntegerField()
    revenue = serializers.FloatField()


class RegionDistributionSerializer(serializers.Serializer):
    """Сериализатор распределения по регионам"""
    region_id = serializers.CharField()
    region_title = serializers.CharField()
    orders_count = serializers.IntegerField()
    completed_count = serializers.IntegerField()
    revenue = serializers.FloatField()


class PeakHoursSerializer(serializers.Serializer):
    """Сериализатор пиковых часов"""
    hour = serializers.CharField()
    orders = serializers.IntegerField()


class DriverPerformanceSerializer(serializers.Serializer):
    """Сериализатор производительности водителей"""
    driver_id = serializers.IntegerField()
    driver_name = serializers.CharField()
    rating = serializers.FloatField()
    orders = serializers.IntegerField()
    revenue = serializers.FloatField()
    total_offers = serializers.IntegerField()
    accepted_offers = serializers.IntegerField()
    declined_offers = serializers.IntegerField()
    acceptance_rate = serializers.FloatField()