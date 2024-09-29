# annotator/views.py

from django.shortcuts import render, get_object_or_404, redirect
from django.http import JsonResponse, HttpResponse, HttpResponseForbidden, FileResponse
from django.contrib.auth.decorators import login_required, user_passes_test
from django.contrib.auth import authenticate, login, logout
from django.conf import settings
from django.contrib import messages  # Import messages framework
from django.contrib.auth.models import User  # Add this import at the top
from .models import Image
from .forms import BulkUploadForm, AddUserForm, DownloadAnnotationsForm  # Import AddUserForm
import os
import json
import logging

# Configure logger
logger = logging.getLogger(__name__)

def is_admin(user):
    return user.is_staff or user.is_superuser

def login_view(request):
    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')
        user = authenticate(request, username=username, password=password)
        if user:
            login(request, user)
            return redirect('image_list')
        else:
            context = {'error': 'Invalid username or password.'}
            return render(request, 'annotator/login.html', context)
    else:
        return render(request, 'annotator/login.html')

@login_required
def logout_view(request):
    logout(request)
    return redirect('login')



@login_required
def image_list(request):
    # Get the 'status' parameter from the GET request. Default to 'all' if not provided.
    status = request.GET.get('status', 'all')
    images = Image.objects.filter(user=request.user).order_by('-uploaded_at')

    # Filter images based on the selected status
    if status != 'all':
        images = images.filter(status=status)

    # Calculate user statistics
    total_images = Image.objects.filter(user=request.user).count()
    annotated_images_count = Image.objects.filter(user=request.user, status__in=['annotated', 'approved']).count()
    approved_images_count = Image.objects.filter(user=request.user, status='approved').count()
    rejected_images_count = Image.objects.filter(user=request.user, status='rejected').count()

    # Calculate percentages
    annotated_percentage = (annotated_images_count / total_images * 100) if total_images > 0 else 0
    approved_percentage = (approved_images_count / total_images * 100) if total_images > 0 else 0
    rejected_percentage = (rejected_images_count / total_images * 100) if total_images > 0 else 0

    context = {
        'images': images,
        'current_status': status,
        'total_images': total_images,
        'annotated_images_count': annotated_images_count,
        'approved_images_count': approved_images_count,
        'rejected_images_count': rejected_images_count,
        'annotated_percentage': annotated_percentage,
        'approved_percentage': approved_percentage,
        'rejected_percentage': rejected_percentage,
    }

    if is_admin(request.user):
        # For admins, calculate overall stats
        overall_total_images = Image.objects.all().count()
        overall_annotated_images_count = Image.objects.filter(status__in=['annotated', 'approved']).count()
        overall_approved_images_count = Image.objects.filter(status='approved').count()
        overall_rejected_images_count = Image.objects.filter(status='rejected').count()

        overall_annotated_percentage = (overall_annotated_images_count / overall_total_images * 100) if overall_total_images > 0 else 0
        overall_approved_percentage = (overall_approved_images_count / overall_total_images * 100) if overall_total_images > 0 else 0
        overall_rejected_percentage = (overall_rejected_images_count / overall_total_images * 100) if overall_total_images > 0 else 0

        # Stats per user
        users = User.objects.all()
        user_stats = []
        for user in users:
            user_total_images = Image.objects.filter(user=user).count()
            user_annotated_images_count = Image.objects.filter(user=user, status__in=['annotated', 'approved']).count()
            user_approved_images_count = Image.objects.filter(user=user, status='approved').count()
            user_rejected_images_count = Image.objects.filter(user=user, status='rejected').count()
            user_annotated_percentage = (user_annotated_images_count / user_total_images * 100) if user_total_images > 0 else 0
            user_approved_percentage = (user_approved_images_count / user_total_images * 100) if user_total_images > 0 else 0
            user_rejected_percentage = (user_rejected_images_count / user_total_images * 100) if user_total_images > 0 else 0

            user_stats.append({
                'username': user.username,
                'total_images': user_total_images,
                'annotated_images_count': user_annotated_images_count,
                'approved_images_count': user_approved_images_count,
                'rejected_images_count': user_rejected_images_count,
                'annotated_percentage': user_annotated_percentage,
                'approved_percentage': user_approved_percentage,
                'rejected_percentage': user_rejected_percentage,
            })

        # Add overall stats and user stats to context
        context.update({
            'overall_total_images': overall_total_images,
            'overall_annotated_images_count': overall_annotated_images_count,
            'overall_approved_images_count': overall_approved_images_count,
            'overall_rejected_images_count': overall_rejected_images_count,
            'overall_annotated_percentage': overall_annotated_percentage,
            'overall_approved_percentage': overall_approved_percentage,
            'overall_rejected_percentage': overall_rejected_percentage,
            'user_stats': user_stats,
        })

        # Handle admin forms
        if request.method == 'POST':
            form_type = request.POST.get('form_type')

            if form_type == 'bulk_upload':
                bulk_form = BulkUploadForm(request.POST, request.FILES)
                add_user_form = AddUserForm()
                download_form = DownloadAnnotationsForm()

                if bulk_form.is_valid():
                    user = bulk_form.cleaned_data['user']
                    images_files = bulk_form.cleaned_data['images']
                    uploaded_count = 0
                    for image_file in images_files:
                        Image.objects.create(user=user, image=image_file)
                        uploaded_count += 1
                    messages.success(request, f"Successfully uploaded {uploaded_count} images for user '{user.username}'.")
                    logger.info(f"User '{request.user.username}' uploaded {uploaded_count} images for user '{user.username}'.")
                    return redirect('image_list')
                else:
                    messages.error(request, "There was an error with your bulk upload. Please ensure all fields are correctly filled.")
            elif form_type == 'add_user':
                add_user_form = AddUserForm(request.POST)
                bulk_form = BulkUploadForm()
                download_form = DownloadAnnotationsForm()

                if add_user_form.is_valid():
                    user = add_user_form.save(commit=False)
                    user.set_password(add_user_form.cleaned_data['password'])
                    user.save()
                    messages.success(request, f"User '{user.username}' has been created successfully.")
                    logger.info(f"Admin '{request.user.username}' created new user '{user.username}' with admin privileges: {user.is_staff}.")
                    return redirect('image_list')
                else:
                    messages.error(request, "There was an error creating the user. Please ensure all fields are correctly filled.")
            else:
                # Invalid form submission
                messages.error(request, "Invalid form submission.")
                bulk_form = BulkUploadForm()
                add_user_form = AddUserForm()
                download_form = DownloadAnnotationsForm()
        else:
            bulk_form = BulkUploadForm()
            add_user_form = AddUserForm()
            download_form = DownloadAnnotationsForm()

        # Pass forms and all users to the template context
        context.update({
            'bulk_form': bulk_form,
            'add_user_form': add_user_form,
            'download_form': download_form,
            'all_users': User.objects.all(),  # For the user selection in the modal
        })

    return render(request, 'annotator/image_list.html', context)


@login_required
def annotate_image(request, image_id):
    image = get_object_or_404(Image, id=image_id)

    # Check if the user is the owner or an admin/staff member
    if image.user != request.user and not is_admin(request.user):
        return HttpResponseForbidden("You do not have permission to annotate this image.")

    if request.method == 'GET':
        # Fetch all image IDs for navigation
        image_list = Image.objects.filter(user=request.user).order_by('-uploaded_at').values_list('id', flat=True)
        image_list = list(image_list)  # Convert QuerySet to list

        try:
            current_index = image_list.index(image.id)
        except ValueError:
            current_index = 0  # Default to 0 if not found

        context = {
            'image': image,
            'image_list_json': json.dumps(image_list),
            'current_index': current_index,
        }
        return render(request, 'annotator/annotate.html', context)

@login_required
def save_annotations(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            image_id = data.get('imageId')
            annotations = data.get('annotations', '')

            image = get_object_or_404(Image, id=image_id)

            if image.user != request.user and not is_admin(request.user):
                return HttpResponseForbidden("You do not have permission to annotate this image.")

            # Save annotations to the database
            image.annotations = annotations
            image.status = 'annotated'
            image.save()

            return JsonResponse({'status': 'success'})
        except Exception as e:
            logger.error(f"Error saving annotations for image {image.image.name}: {e}")
            return JsonResponse({'status': 'failed', 'error': str(e)}, status=400)

    else:
        return JsonResponse({'status': 'failed', 'error': 'Invalid request method.'}, status=400)

@login_required
def serve_protected_image(request, path):
    file_path = os.path.join(settings.MEDIA_ROOT, path)

    if not os.path.exists(file_path):
        return HttpResponseForbidden("File not found.")

    return FileResponse(open(file_path, 'rb'), content_type='image/jpeg')

@login_required
def serve_annotations_file(request, image_id):
    image = get_object_or_404(Image, id=image_id)

    # Only the owner or admin can access the annotations
    if image.user != request.user and not is_admin(request.user):
        return HttpResponseForbidden("You do not have permission to access this annotation file.")

    annotations = image.annotations
    if not annotations:
        return HttpResponse("Annotations not found.", status=404)

    return HttpResponse(annotations, content_type='text/plain')
