from django.db import models
from django.contrib.auth.models import User
import datetime

class Category(models.Model):
    name = models.CharField(max_length=100)
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)  # Nullable for shared categories
    is_global = models.BooleanField(default=False)  # Flag for shared/global categories

    def __str__(self):
        return self.name

    class Meta:
        unique_together = [['name', 'user']]  # Ensures uniqueness within a user's categories, but allows global duplicates

class Transaction(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    date = models.DateField()
    status = models.CharField(max_length=10, choices=[('spent', 'Spent'), ('earned', 'Earned')])
    category = models.ForeignKey(Category, on_delete=models.CASCADE)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default='QAR')
    description = models.TextField()

    def __str__(self):
        return f"{self.status} - {self.amount} {self.currency}"

class Plan(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    type = models.CharField(max_length=10, choices=[('monthly', 'Monthly'), ('custom', 'Custom')])
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    description = models.TextField()
    categories = models.ManyToManyField(Category)
    from_date = models.DateField()
    to_date = models.DateField()
    left_money = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    status = models.CharField(max_length=10, default='Active')

    def __str__(self):
        return f"{self.type} Plan - {self.description}"

    def save(self, *args, **kwargs):
        if not self.left_money:
            self.left_money = self.amount
        super().save(*args, **kwargs)

    def update_status(self):
        today = datetime.date.today()
        if today > self.to_date:
            self.status = 'Completed' if self.left_money <= 0 else 'Failed'
        else:
            self.status = 'Active'
        self.save()