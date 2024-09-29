from django.db import models
from django.contrib.auth.models import User

class Image(models.Model):
    STATUS_CHOICES = [
        ('uploaded', 'Uploaded'),
        ('annotated', 'Annotated'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]

    id = models.AutoField(primary_key=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='images')
    image = models.ImageField(null=True, blank=True, upload_to='images/')
    annotations = models.TextField(null=True, blank=True)  # New field to store annotations
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='uploaded')
    uploaded_at = models.DateTimeField(auto_now_add=True)

    objects = models.Manager()  # Default manager

    def __str__(self):
        return f"Image {self.image.name} by {self.user.username}"  # Updated to use image name
