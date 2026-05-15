# core/exceptions.py
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status


def custom_exception_handler(exc, context):
    """
    Wraps all API errors in a consistent envelope:
    { "error": true, "message": "...", "details": {...} }

    WHY: Default DRF errors have inconsistent shapes. A consistent error
    format means the frontend can handle all errors with one piece of code.
    """
    response = exception_handler(exc, context)

    if response is not None:
        error_data = {
            'error': True,
            'message': _get_error_message(response.data),
            'details': response.data,
            'status_code': response.status_code,
        }
        response.data = error_data

    return response


def _get_error_message(data):
    """Extract the most human-readable error message from DRF's error data."""
    if isinstance(data, dict):
        # DRF validation errors: {'field': ['error message']}
        for key, value in data.items():
            if key == 'detail':
                return str(value)
            if isinstance(value, list) and value:
                return f"{key}: {value[0]}"
        return "Validation failed"
    if isinstance(data, list) and data:
        return str(data[0])
    return str(data)