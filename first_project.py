# Мой первый IT-проект
# {{date:DD.MM.YYYY}} - Начало пути в BI-разработку

def calculate_average(numbers):
    """Функция для расчёта среднего значения"""
    return sum(numbers) / len(numbers) if numbers else 0

# Тестируем
test_data = [10, 20, 30, 40, 50]
result = calculate_average(test_data)
print(f"Среднее значение списка {test_data} = {result}")

# Дополнительно: анализ доходов
weekly_income = [5000, 6000, 5500, 7000, 6500]  # Доходы за неделю
avg_income = calculate_average(weekly_income)
print(f"\nСредний доход за неделю: {avg_income:.2f} руб.")
print(f"Потенциальный доход за месяц (4 недели): {avg_income * 4:.2f} руб.")