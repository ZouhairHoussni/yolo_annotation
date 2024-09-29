from django.contrib import admin
from .models import Image

@admin.register(Image)
class ImageAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'uploaded_at', 'status')
    list_filter = ('status', 'uploaded_at', 'user')
    search_fields = ('user__username', 'id')
    ordering = ('-uploaded_at',)
