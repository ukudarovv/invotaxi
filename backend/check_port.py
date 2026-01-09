#!/usr/bin/env python
"""
Скрипт для проверки, какой процесс использует порт 8000
Помогает найти и остановить лишние серверы
"""
import sys
import socket

def check_port(port=8000):
    """Проверяет, занят ли порт и пытается определить процесс"""
    print(f"Проверка порта {port}...")
    print("-" * 60)
    
    # Проверяем, занят ли порт
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    result = sock.connect_ex(('localhost', port))
    sock.close()
    
    if result == 0:
        print(f"✅ Порт {port} занят (сервер работает)")
        
        # Пытаемся определить процесс (Windows)
        try:
            import subprocess
            if sys.platform == 'win32':
                # Windows: используем netstat
                result = subprocess.run(
                    ['netstat', '-ano'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                lines = result.stdout.split('\n')
                for line in lines:
                    if f':{port}' in line and 'LISTENING' in line:
                        parts = line.split()
                        if len(parts) >= 5:
                            pid = parts[-1]
                            print(f"   Процесс ID: {pid}")
                            
                            # Пытаемся получить имя процесса
                            try:
                                task_result = subprocess.run(
                                    ['tasklist', '/FI', f'PID eq {pid}', '/FO', 'CSV'],
                                    capture_output=True,
                                    text=True,
                                    timeout=5
                                )
                                if 'daphne' in task_result.stdout.lower():
                                    print(f"   ✅ Процесс: daphne (правильно)")
                                elif 'python' in task_result.stdout.lower():
                                    print(f"   ⚠️ Процесс: python (возможно runserver)")
                                    print(f"   Проверьте, запущен ли runserver: python manage.py runserver")
                                else:
                                    print(f"   Процесс: {task_result.stdout.split(',')[0] if task_result.stdout else 'unknown'}")
                            except:
                                pass
            else:
                # Linux/Mac: используем lsof
                result = subprocess.run(
                    ['lsof', '-i', f':{port}'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if result.stdout:
                    print("   Процессы на порту:")
                    print(result.stdout)
        except Exception as e:
            print(f"   Не удалось определить процесс: {e}")
            print(f"   Проверьте вручную через диспетчер задач (Windows) или ps aux (Linux)")
        
        print("\n" + "=" * 60)
        print("Рекомендации:")
        print("1. Убедитесь, что запущен ТОЛЬКО daphne")
        print("2. Остановите все процессы runserver (python manage.py runserver)")
        print("3. Проверьте, что в логах видно '[ASGI] Application initialized'")
        print("4. Если видите 'Starting development server' - это runserver, остановите его!")
        print("=" * 60)
        return True
    else:
        print(f"❌ Порт {port} свободен (сервер не запущен)")
        print("\nЗапустите сервер:")
        print("  Windows: START_SERVER.bat")
        print("  Linux/Mac: ./START_SERVER.sh")
        return False

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    check_port(port)
