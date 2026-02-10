from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'^ws/test/$', consumers.TestWebSocketConsumer.as_asgi()),  # Тестовый endpoint без авторизации
    re_path(r'^ws/orders/(?P<order_id>[^/]+)/$', consumers.OrderConsumer.as_asgi()),
    re_path(r'^ws/drivers/(?P<driver_id>[^/]+)/$', consumers.DriverConsumer.as_asgi()),
    re_path(r'^ws/passengers/(?P<passenger_id>[^/]+)/$', consumers.PassengerConsumer.as_asgi()),
    re_path(r'^ws/dispatch-map/$', consumers.DispatchMapConsumer.as_asgi()),
]

