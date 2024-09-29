# annotator/forms.py

from django import forms
from django.contrib.auth.models import User
from django.contrib.auth.forms import UsernameField

class MultiFileInput(forms.ClearableFileInput):
    allow_multiple_selected = True

class MultiFileField(forms.FileField):
    widget = MultiFileInput

    def clean(self, data, initial=None):
        if not data:
            return []
        if isinstance(data, list):
            for item in data:
                super().clean(item, initial)
            return data
        else:
            super().clean(data, initial)
            return [data]

class BulkUploadForm(forms.Form):
    images = MultiFileField(required=True)
    user = forms.ModelChoiceField(queryset=User.objects.all())

class AddUserForm(forms.ModelForm):
    """
    Form for creating a new user with username, password, and role.
    """
    password = forms.CharField(
        label="Password",
        widget=forms.PasswordInput,
        help_text="Enter a strong password."
    )
    password_confirm = forms.CharField(
        label="Confirm Password",
        widget=forms.PasswordInput,
        help_text="Enter the same password as before, for verification."
    )
    is_staff = forms.BooleanField(
        label="Admin Privileges",
        required=False,
        help_text="Check this box to grant admin privileges to the user."
    )

    class Meta:
        model = User
        fields = ('username', 'password', 'password_confirm', 'is_staff')
        field_classes = {'username': UsernameField}

    def clean_username(self):
        username = self.cleaned_data.get('username')
        if User.objects.filter(username=username).exists():
            raise forms.ValidationError("A user with that username already exists.")
        return username

    def clean(self):
        cleaned_data = super().clean()
        password = cleaned_data.get("password")
        password_confirm = cleaned_data.get("password_confirm")

        if password and password_confirm and password != password_confirm:
            self.add_error('password_confirm', "Passwords do not match.")

        return cleaned_data
    

class DownloadAnnotationsForm(forms.Form):
    user = forms.ModelChoiceField(
        queryset=User.objects.all(),
        empty_label='All Users',
        required=False,
        label='Select User'
    )