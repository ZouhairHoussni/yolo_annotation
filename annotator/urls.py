# annotator/urls.py

from django.urls import path
from . import views, admin_views

urlpatterns = [
    # User URLs
    path('', views.image_list, name='image_list'),
    path('annotate/<int:image_id>/', views.annotate_image, name='annotate_image'),
    path('save_annotations/', views.save_annotations, name='save_annotations'),
    path('serve_annotations/<int:image_id>/', views.serve_annotations_file, name='serve_annotations_file'),
    path('media/<path:path>/', views.serve_protected_image, name='serve_protected_image'),
    path('login/', views.login_view, name='login'),
    path('logout/', views.logout_view, name='logout'),

    # Admin URLs
    path('annotate-admin/annotated-images/', admin_views.annotated_images_view, name='annotated_images'),
    path('annotate-admin/approve/<int:image_id>/', admin_views.approve_image_view, name='approve_image'),
    path('annotate-admin/reject/<int:image_id>/', admin_views.reject_image_view, name='reject_image'),
    path('annotate-admin/serve_annotated_image/<int:image_id>/', admin_views.serve_annotated_image, name='serve_annotated_image'),
    
    # Submit Form URL (handles both Bulk Upload and Add User)
    path('submit_form/', views.image_list, name='submit_form'),  # Changed to image_list view
    path('download_annotations/', admin_views.download_annotations, name='download_annotations'),
]
