# annotator/admin_views.py

from django.shortcuts import render, get_object_or_404, redirect
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse, HttpResponseForbidden, HttpResponse
from django.views.decorators.http import require_POST
from django.conf import settings
from django.contrib import messages 
from .models import Image
from .forms import DownloadAnnotationsForm
import os
from PIL import Image as PILImage
from PIL import ImageDraw, ImageFont

import zipfile
from django.utils.text import slugify
import io

def is_admin(user):
    return user.is_staff or user.is_superuser

@login_required
def annotated_images_view(request):
    if not is_admin(request.user):
        return HttpResponseForbidden("You do not have permission to view this page.")

    annotated_images = Image.objects.filter(status='annotated', image__isnull=False)

    context = {
        'annotated_images': annotated_images,
    }
    return render(request, 'annotator/admin_annotated_images.html', context)

@require_POST
@login_required
def approve_image_view(request, image_id):
    if not is_admin(request.user):
        return HttpResponseForbidden("You do not have permission to approve images.")

    image = get_object_or_404(Image, id=image_id)
    image.status = 'approved'
    image.save()
    return JsonResponse({'status': 'success'})

@require_POST
@login_required
def reject_image_view(request, image_id):
    if not is_admin(request.user):
        return HttpResponseForbidden("You do not have permission to reject images.")

    image = get_object_or_404(Image, id=image_id)
    image.status = 'rejected'
    image.save()
    return JsonResponse({'status': 'success'})

@login_required
def serve_annotated_image(request, image_id):
    image = get_object_or_404(Image, id=image_id)
    image_path = image.image.path

    # Read annotations from the database
    annotations_text = image.annotations
    if not annotations_text:
        return HttpResponse("No annotations found.", status=404)

    pil_image = PILImage.open(image_path).convert("RGB")
    draw = ImageDraw.Draw(pil_image)

    lines = annotations_text.strip().split('\n')

    class_colors = {
        '0': 'red',
        '1': 'green',
        '2': 'blue',
    }

    font_path = os.path.join(settings.BASE_DIR, 'static', 'fonts', 'arial.ttf')
    if os.path.exists(font_path):
        font = ImageFont.truetype(font_path, 16)
    else:
        font = ImageFont.load_default()

    for line in lines:
        parts = line.strip().split()
        if len(parts) != 5:
            continue
        class_id, x_center, y_center, width, height = parts
        try:
            x_center = float(x_center)
            y_center = float(y_center)
            width = float(width)
            height = float(height)
        except ValueError:
            continue

        img_width, img_height = pil_image.size
        abs_x = (x_center - width / 2) * img_width
        abs_y = (y_center - height / 2) * img_height
        abs_width = width * img_width
        abs_height = height * img_height

        color = class_colors.get(class_id, 'yellow')

        draw.rectangle([abs_x, abs_y, abs_x + abs_width, abs_y + abs_height], outline=color, width=4)
        draw.text((abs_x + 5, abs_y + 5), f"Class {class_id}", fill=color, font=font)

    buffer = io.BytesIO()
    pil_image.save(buffer, format='JPEG')
    buffer.seek(0)

    return HttpResponse(buffer, content_type='image/jpeg')

@login_required
def download_annotations(request):
    if not is_admin(request.user):
        return HttpResponseForbidden("You do not have permission to download annotations.")

    if request.method == 'POST':
        download_form = DownloadAnnotationsForm(request.POST)
        if download_form.is_valid():
            user = download_form.cleaned_data['user']
            if user:
                images = Image.objects.filter(user=user, status='approved', annotations__isnull=False)
            else:
                images = Image.objects.filter(status='approved', annotations__isnull=False)

            if not images.exists():
                messages.error(request, "No approved annotations found for the selected user(s).")
                return redirect('image_list')

            # Create a BytesIO buffer to write the ZIP file into
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, 'w') as zip_file:
                for image in images:
                    if image.annotations:
                        image_name = os.path.basename(image.image.name)
                        annotation_filename = f"{os.path.splitext(image_name)[0]}.txt"
                        # Clean up the filename to avoid issues
                        annotation_filename = slugify(annotation_filename)
                        zip_file.writestr(annotation_filename, image.annotations)

            zip_buffer.seek(0)
            response = HttpResponse(zip_buffer, content_type='application/zip')
            response['Content-Disposition'] = 'attachment; filename=annotations.zip'
            return response
        else:
            messages.error(request, "Invalid form submission.")
            return redirect('image_list')
    else:
        return HttpResponseForbidden("Invalid request method.")