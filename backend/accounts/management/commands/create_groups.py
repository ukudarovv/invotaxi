"""
Management command для создания групп пользователей (admin, dispatcher, operator)
"""
from django.core.management.base import BaseCommand
from django.contrib.auth.models import Group, Permission


class Command(BaseCommand):
    help = 'Создает группы пользователей: admin, dispatcher, operator'

    def handle(self, *args, **options):
        self.stdout.write('Создание групп пользователей...')

        # Создаем группу Admin
        admin_group, admin_created = Group.objects.get_or_create(name='admin')
        if admin_created:
            self.stdout.write(self.style.SUCCESS(f'Создана группа: admin'))
        else:
            self.stdout.write(f'Группа admin уже существует')

        # Создаем группу Dispatcher
        dispatcher_group, dispatcher_created = Group.objects.get_or_create(name='dispatcher')
        if dispatcher_created:
            self.stdout.write(self.style.SUCCESS(f'Создана группа: dispatcher'))
        else:
            self.stdout.write(f'Группа dispatcher уже существует')

        # Создаем группу Operator
        operator_group, operator_created = Group.objects.get_or_create(name='operator')
        if operator_created:
            self.stdout.write(self.style.SUCCESS(f'Создана группа: operator'))
        else:
            self.stdout.write(f'Группа operator уже существует')

        self.stdout.write(self.style.SUCCESS('\nВсе группы созданы успешно!'))

