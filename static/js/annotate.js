// static/js/annotate.js

document.addEventListener('DOMContentLoaded', function() {
    console.log('annotate.js loaded');

    // Get elements from the DOM
    const canvas = document.getElementById('annotation-canvas');
    if (!canvas) {
        console.error('Canvas element not found');
        return;
    }
    const ctx = canvas.getContext('2d');

    const classSelect = document.getElementById('class-select');
    const validateButton = document.getElementById('validate-button');
    const saveButton = document.getElementById('save-button');
    const undoButton = document.getElementById('undo-button');
    const redoButton = document.getElementById('redo-button');
    const deleteButton = document.getElementById('delete-button');
    const modifyButton = document.getElementById('modify-button');
    const clearButton = document.getElementById('clear-button');
    const annotationList = document.getElementById('annotation-items');
    const prevButton = document.getElementById('prev-button');
    const nextButton = document.getElementById('next-button');

    // Variables to manage annotations and drawing state
    let annotations = [];
    let currentAnnotation = null;
    let isDrawing = false;
    let isResizing = false;
    let resizeHandle = null;
    let imageLoaded = false;
    let currentIndex = parseInt(currentIndexFromDjango);
    let selectedAnnotationIndex = null;

    // Undo/Redo stacks
    let undoStack = [];
    let redoStack = [];

    // Class color mapping
    const classColors = {
        0: 'red',
        1: 'green',
        2: 'blue',
        // Add more classes and colors as needed
    };
    // Mapping Class IDs to Class Names
    let classIdToName = {};
    for (let option of classSelect.options) {
        classIdToName[option.value] = option.text;
    }

// Counters for each class
let classCounters = {};

    // Handle size for resizing
    const handleSize = 8;

    // Load the image and set up the canvas
    const image = new Image();
    image.src = imageUrl;
    console.log('Image URL:', imageUrl);

    image.onload = function() {
        console.log('Image loaded');

        // Set canvas dimensions to match the image's natural size
        canvas.width = image.width;
        canvas.height = image.height;

        // Set the canvas CSS dimensions to match the internal dimensions
        canvas.style.width = image.width + 'px';
        canvas.style.height = image.height + 'px';

        // Adjust the container's dimensions to match the image's dimensions
        const container = document.getElementById('image-container');
        container.style.width = image.width + 'px';
        container.style.height = image.height + 'px';

        // Draw the image onto the canvas
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

        imageLoaded = true;
        redrawCanvas();
        loadAnnotations(); // Load existing annotations if any
    };

    image.onerror = function() {
        console.error('Failed to load image.');
        alert('Failed to load image.');
    };

    // Helper function to get mouse position relative to the canvas
    function getMousePos(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    // Event listeners for drawing and adjusting
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseout', onMouseUp); // To handle mouse leaving the canvas

    function onMouseDown(e) {
        console.log('Mouse down event');
        if (!imageLoaded) {
            console.log('Image not loaded yet');
            return;
        }
        const { x, y } = getMousePos(e);

        if (currentAnnotation) {
            // Currently in drawing or modifying mode
            // Check if mouse is over a resize handle
            resizeHandle = getHandleUnderMouse(x, y, currentAnnotation);
            if (resizeHandle) {
                isResizing = true;
                return;
            } else if (isPointInBoundingBox(x, y, currentAnnotation)) {
                // Start moving the bounding box
                isDrawing = true;
                currentAnnotation.offsetX = x - currentAnnotation.x_start;
                currentAnnotation.offsetY = y - currentAnnotation.y_start;
                return;
            }
            // Do not deselect or cancel the current annotation
            // Clicking outside will have no effect in this mode
        } else {
            // Not in drawing or modifying mode
            // Start drawing a new bounding box
            startNewAnnotation(x, y);
        }
    }

    function onMouseMove(e) {
        if (!imageLoaded) return;
        const { x, y } = getMousePos(e);
        canvas.style.cursor = 'default';

        if (currentAnnotation) {
            // Change cursor if over a handle
            const handle = getHandleUnderMouse(x, y, currentAnnotation);
            if (handle) {
                canvas.style.cursor = getCursorForHandle(handle);
            } else if (isPointInBoundingBox(x, y, currentAnnotation)) {
                canvas.style.cursor = 'move';
            }
        }

        if (isDrawing && currentAnnotation && !isResizing) {
            // Move the bounding box
            const newXStart = x - currentAnnotation.offsetX;
            const newYStart = y - currentAnnotation.offsetY;
            const dx = newXStart - currentAnnotation.x_start;
            const dy = newYStart - currentAnnotation.y_start;

            currentAnnotation.x_start += dx;
            currentAnnotation.y_start += dy;
            currentAnnotation.x_end += dx;
            currentAnnotation.y_end += dy;

            redrawCanvas();
        } else if (isResizing && currentAnnotation && resizeHandle) {
            // Resize the bounding box based on the handle
            resizeBoundingBox(currentAnnotation, resizeHandle, x, y);
            redrawCanvas();
        }
    }

    function onMouseUp(e) {
        if (isDrawing) {
            isDrawing = false;
        }
        if (isResizing) {
            isResizing = false;
            resizeHandle = null;
        }
    }

    function startNewAnnotation(x, y) {
        currentAnnotation = {
            class_id: parseInt(classSelect.value),
            x_start: x,
            y_start: y,
            x_end: x,
            y_end: y,
        };
        isResizing = true;
        resizeHandle = 'se'; // Start resizing from southeast corner
    }

    // Validate the current annotation
    validateButton.addEventListener('click', () => {
        if (currentAnnotation) {
            let actionType = 'add';
            let previousAnnotation = null;

            if (currentAnnotation.previousData) {
                actionType = 'modify';
                previousAnnotation = currentAnnotation.previousData;
            }

            // Convert the annotation to the desired format
            const annotation = convertAnnotation(currentAnnotation);
            const newAnnotation = {
                ...annotation,
                class_id: currentAnnotation.class_id,
                x_start: currentAnnotation.x_start,
                y_start: currentAnnotation.y_start,
                x_end: currentAnnotation.x_end,
                y_end: currentAnnotation.y_end,
            };

            // Add to annotations array
            annotations.push(newAnnotation);

            // Record the action
            undoStack.push({
                type: actionType,
                data: newAnnotation,
                previousData: previousAnnotation,
            });
            redoStack = []; // Clear redo stack
            updateUndoRedoButtons();

            currentAnnotation = null; // Reset current annotation
            selectedAnnotationIndex = null; // Reset selected annotation
            updateAnnotationsList();
            redrawCanvas();
        }
    });

    // Save annotations in TXT format
    saveButton.addEventListener('click', () => {
        if (!annotations.length) {
            alert('No annotations to save.');
            return;
        }

        // Prepare annotations data for saving in YOLO TXT format
        const annotationsToSave = annotations.map(ann => {
            const x_center = ((ann.x_start + ann.x_end) / 2 / canvas.width).toFixed(6);
            const y_center = ((ann.y_start + ann.y_end) / 2 / canvas.height).toFixed(6);
            const width = (Math.abs(ann.x_end - ann.x_start) / canvas.width).toFixed(6);
            const height = (Math.abs(ann.y_end - ann.y_start) / canvas.height).toFixed(6);

            return `${ann.class_id} ${x_center} ${y_center} ${width} ${height}`;
        }).join('\n');

        // Send the annotations array to the server via AJAX POST request
        fetch(saveAnnotationsUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken, // Ensure CSRF token is included
            },
            body: JSON.stringify({
                imageId: imageId,
                annotations: annotationsToSave,
            }),
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                alert('Annotations saved successfully.');
                // Optionally redirect to the next image or update the UI
            } else {
                alert('Failed to save annotations.');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('An error occurred while saving annotations.');
        });
    });

    // Undo the last action
    undoButton.addEventListener('click', () => {
        if (undoStack.length > 0) {
            const action = undoStack.pop();
            redoStack.push(action);
            updateUndoRedoButtons();

            switch (action.type) {
                case 'add':
                    // Remove the added annotation
                    annotations = annotations.filter(ann => ann !== action.data);
                    break;
                case 'delete':
                    // Re-add the deleted annotation
                    annotations.push(action.data);
                    break;
                case 'modify':
                    // Revert to the previous state
                    annotations = annotations.filter(ann => ann !== action.data);
                    annotations.push(action.previousData);
                    break;
                case 'clear':
                    // Restore the annotations
                    annotations = action.data;
                    break;
                default:
                    break;
            }
            selectedAnnotationIndex = null;
            updateAnnotationsList();
            redrawCanvas();
        } else {
            alert('No actions to undo.');
        }
    });

    // Redo the last undone action
    redoButton.addEventListener('click', () => {
        if (redoStack.length > 0) {
            const action = redoStack.pop();
            undoStack.push(action);
            updateUndoRedoButtons();

            switch (action.type) {
                case 'add':
                    // Re-add the annotation
                    annotations.push(action.data);
                    break;
                case 'delete':
                    // Remove the annotation
                    annotations = annotations.filter(ann => ann !== action.data);
                    break;
                case 'modify':
                    // Apply the modification
                    annotations = annotations.filter(ann => ann !== action.previousData);
                    annotations.push(action.data);
                    break;
                case 'clear':
                    // Remove all annotations
                    annotations = [];
                    break;
                default:
                    break;
            }
            selectedAnnotationIndex = null;
            updateAnnotationsList();
            redrawCanvas();
        } else {
            alert('No actions to redo.');
        }
    });

    // Modify selected annotation
    modifyButton.addEventListener('click', () => {
        if (selectedAnnotationIndex !== null) {
            // Store the previous state
            const previousAnnotation = { ...annotations[selectedAnnotationIndex] };

            // Set the selected annotation as the current annotation for modification
            currentAnnotation = { ...annotations[selectedAnnotationIndex] };

            // Store previous data in currentAnnotation
            currentAnnotation.previousData = previousAnnotation;

            // Remove it from the annotations array
            annotations.splice(selectedAnnotationIndex, 1);

            // Reset the selected annotation index
            selectedAnnotationIndex = null;

            updateAnnotationsList();
            redrawCanvas();
        } else {
            alert('Please select an annotation to modify.');
        }
    });

    // Delete selected annotation
    deleteButton.addEventListener('click', () => {
        if (selectedAnnotationIndex !== null) {
            // Get the annotation to delete
            const deletedAnnotation = annotations[selectedAnnotationIndex];

            // Remove the selected annotation from the annotations array
            annotations.splice(selectedAnnotationIndex, 1);

            // Record the action
            undoStack.push({
                type: 'delete',
                data: deletedAnnotation,
            });
            redoStack = []; // Clear redo stack
            updateUndoRedoButtons();

            // Reset the selected annotation index
            selectedAnnotationIndex = null;

            updateAnnotationsList();
            redrawCanvas();
        } else {
            alert('Please select an annotation to delete.');
        }
    });

    // Clear all annotations
    clearButton.addEventListener('click', () => {
        if (annotations.length > 0) {
            if (confirm('Are you sure you want to delete all annotations?')) {
                // Record the action with all current annotations
                undoStack.push({
                    type: 'clear',
                    data: [...annotations], // Clone the array
                });
                redoStack = []; // Clear redo stack
                updateUndoRedoButtons();

                annotations = [];
                currentAnnotation = null;
                selectedAnnotationIndex = null;
                updateAnnotationsList();
                redrawCanvas();
            }
        } else {
            alert('There are no annotations to clear.');
        }
    });

    // Navigation buttons
    prevButton.addEventListener('click', () => {
        navigateToImage(currentIndex - 1);
    });

    nextButton.addEventListener('click', () => {
        navigateToImage(currentIndex + 1);
    });

    function navigateToImage(index) {
        if (index >= 0 && index < imageListFromDjango.length) {
            const newImageId = imageListFromDjango[index];
            window.location.href = `/annotate/${newImageId}/`;
        } else {
            alert('No more images.');
        }
    }

    // Redraw the canvas with the image and annotations
    function redrawCanvas() {
        if (!imageLoaded) return;

        // Clear the canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw the image
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

        // Draw all validated annotations
        annotations.forEach((ann, index) => {
            let color = classColors[ann.class_id] || 'blue';
            let lineWidth = 3;

            if (index === selectedAnnotationIndex) {
                // Highlight the selected annotation
                color = 'orange'; // Use a distinct color
                lineWidth = 4;
            }

            drawBoundingBox(ann, color, lineWidth);
        });

        // Draw the current annotation being drawn or adjusted
        if (currentAnnotation) {
            drawBoundingBox(currentAnnotation, classColors[currentAnnotation.class_id] || 'red', 3, true);
        }
    }

    // Draw a single bounding box
    function drawBoundingBox(ann, color, lineWidth = 3, isCurrent = false) {
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        const x = Math.min(ann.x_start, ann.x_end);
        const y = Math.min(ann.y_start, ann.y_end);
        const width = Math.abs(ann.x_end - ann.x_start);
        const height = Math.abs(ann.y_end - ann.y_start);
        ctx.strokeRect(x, y, width, height);

        if (isCurrent) {
            // Draw resize handles
            drawHandles(ann);
        }
    }

    // Draw resize handles on the bounding box
    function drawHandles(ann) {
        const handles = getHandlesCoordinates(ann);
        ctx.fillStyle = 'white';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 1;

        for (let handle in handles) {
            const { x, y } = handles[handle];
            ctx.fillRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize);
            ctx.strokeRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize);
        }
    }

    // Get the coordinates of the resize handles
    function getHandlesCoordinates(ann) {
        const x_start = ann.x_start;
        const y_start = ann.y_start;
        const x_end = ann.x_end;
        const y_end = ann.y_end;
        const x_center = (x_start + x_end) / 2;
        const y_center = (y_start + y_end) / 2;

        return {
            nw: { x: x_start, y: y_start },
            n: { x: x_center, y: y_start },
            ne: { x: x_end, y: y_start },
            e: { x: x_end, y: y_center },
            se: { x: x_end, y: y_end },
            s: { x: x_center, y: y_end },
            sw: { x: x_start, y: y_end },
            w: { x: x_start, y: y_center },
        };
    }

    // Check if the mouse is over a handle
    function getHandleUnderMouse(x, y, ann) {
        const handles = getHandlesCoordinates(ann);
        for (let handle in handles) {
            const hx = handles[handle].x;
            const hy = handles[handle].y;
            if (x >= hx - handleSize / 2 && x <= hx + handleSize / 2 &&
                y >= hy - handleSize / 2 && y <= hy + handleSize / 2) {
                return handle;
            }
        }
        return null;
    }

    // Get cursor style based on handle
    function getCursorForHandle(handle) {
        const cursors = {
            n: 'ns-resize',
            s: 'ns-resize',
            e: 'ew-resize',
            w: 'ew-resize',
            ne: 'nesw-resize',
            sw: 'nesw-resize',
            nw: 'nwse-resize',
            se: 'nwse-resize',
        };
        return cursors[handle] || 'default';
    }

    // Resize the bounding box based on handle and mouse position
    function resizeBoundingBox(ann, handle, x, y) {
        switch (handle) {
            case 'n':
                ann.y_start = y;
                break;
            case 's':
                ann.y_end = y;
                break;
            case 'e':
                ann.x_end = x;
                break;
            case 'w':
                ann.x_start = x;
                break;
            case 'ne':
                ann.x_end = x;
                ann.y_start = y;
                break;
            case 'nw':
                ann.x_start = x;
                ann.y_start = y;
                break;
            case 'se':
                ann.x_end = x;
                ann.y_end = y;
                break;
            case 'sw':
                ann.x_start = x;
                ann.y_end = y;
                break;
            default:
                break;
        }

        // Optional: Add constraints to prevent negative widths/heights
        if (ann.x_end < ann.x_start) {
            [ann.x_start, ann.x_end] = [ann.x_end, ann.x_start];
        }
        if (ann.y_end < ann.y_start) {
            [ann.y_start, ann.y_end] = [ann.y_end, ann.y_start];
        }
    }

    // Convert the annotation to the desired format (YOLO TXT format)
    function convertAnnotation(ann) {
        const x_center = ((ann.x_start + ann.x_end) / 2 / canvas.width).toFixed(6);
        const y_center = ((ann.y_start + ann.y_end) / 2 / canvas.height).toFixed(6);
        const width = (Math.abs(ann.x_end - ann.x_start) / canvas.width).toFixed(6);
        const height = (Math.abs(ann.y_end - ann.y_start) / canvas.height).toFixed(6);

        return {
            class_id: ann.class_id,
            x_center: x_center,
            y_center: y_center,
            width: width,
            height: height,
        };
    }

    // Save annotations in YOLO TXT format
    saveButton.addEventListener('click', () => {
        if (!annotations.length) {
            alert('No annotations to save.');
            return;
        }

        // Prepare annotations data for saving in YOLO TXT format
        const annotationsToSave = annotations.map(ann => {
            const x_center = ((ann.x_start + ann.x_end) / 2 / canvas.width).toFixed(6);
            const y_center = ((ann.y_start + ann.y_end) / 2 / canvas.height).toFixed(6);
            const width = (Math.abs(ann.x_end - ann.x_start) / canvas.width).toFixed(6);
            const height = (Math.abs(ann.y_end - ann.y_start) / canvas.height).toFixed(6);

            return `${ann.class_id} ${x_center} ${y_center} ${width} ${height}`;
        }).join('\n');

        // Send the annotations array to the server via AJAX POST request
        fetch(saveAnnotationsUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken, // Ensure CSRF token is included
            },
            body: JSON.stringify({
                imageId: imageId,
                annotations: annotationsToSave,
            }),
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                alert('Annotations saved successfully.');
                // Optionally redirect to the next image or update the UI
            } else {
                alert('Failed to save annotations.');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('An error occurred while saving annotations.');
        });
    });

    // Undo the last action
    undoButton.addEventListener('click', () => {
        if (undoStack.length > 0) {
            const action = undoStack.pop();
            redoStack.push(action);
            updateUndoRedoButtons();

            switch (action.type) {
                case 'add':
                    // Remove the added annotation
                    annotations = annotations.filter(ann => ann !== action.data);
                    break;
                case 'delete':
                    // Re-add the deleted annotation
                    annotations.push(action.data);
                    break;
                case 'modify':
                    // Revert to the previous state
                    annotations = annotations.filter(ann => ann !== action.data);
                    annotations.push(action.previousData);
                    break;
                case 'clear':
                    // Restore the annotations
                    annotations = action.data;
                    break;
                default:
                    break;
            }
            selectedAnnotationIndex = null;
            updateAnnotationsList();
            redrawCanvas();
        } else {
            alert('No actions to undo.');
        }
    });

    // Redo the last undone action
    redoButton.addEventListener('click', () => {
        if (redoStack.length > 0) {
            const action = redoStack.pop();
            undoStack.push(action);
            updateUndoRedoButtons();

            switch (action.type) {
                case 'add':
                    // Re-add the annotation
                    annotations.push(action.data);
                    break;
                case 'delete':
                    // Remove the annotation
                    annotations = annotations.filter(ann => ann !== action.data);
                    break;
                case 'modify':
                    // Apply the modification
                    annotations = annotations.filter(ann => ann !== action.previousData);
                    annotations.push(action.data);
                    break;
                case 'clear':
                    // Remove all annotations
                    annotations = [];
                    break;
                default:
                    break;
            }
            selectedAnnotationIndex = null;
            updateAnnotationsList();
            redrawCanvas();
        } else {
            alert('No actions to redo.');
        }
    });

    // Modify selected annotation
    modifyButton.addEventListener('click', () => {
        if (selectedAnnotationIndex !== null) {
            // Store the previous state
            const previousAnnotation = { ...annotations[selectedAnnotationIndex] };

            // Set the selected annotation as the current annotation for modification
            currentAnnotation = { ...annotations[selectedAnnotationIndex] };

            // Store previous data in currentAnnotation
            currentAnnotation.previousData = previousAnnotation;

            // Remove it from the annotations array
            annotations.splice(selectedAnnotationIndex, 1);

            // Reset the selected annotation index
            selectedAnnotationIndex = null;

            updateAnnotationsList();
            redrawCanvas();
        } else {
            alert('Please select an annotation to modify.');
        }
    });

    // Delete selected annotation
    deleteButton.addEventListener('click', () => {
        if (selectedAnnotationIndex !== null) {
            // Get the annotation to delete
            const deletedAnnotation = annotations[selectedAnnotationIndex];

            // Remove the selected annotation from the annotations array
            annotations.splice(selectedAnnotationIndex, 1);

            // Record the action
            undoStack.push({
                type: 'delete',
                data: deletedAnnotation,
            });
            redoStack = []; // Clear redo stack
            updateUndoRedoButtons();

            // Reset the selected annotation index
            selectedAnnotationIndex = null;

            updateAnnotationsList();
            redrawCanvas();
        } else {
            alert('Please select an annotation to delete.');
        }
    });

    // Clear all annotations
    clearButton.addEventListener('click', () => {
        if (annotations.length > 0) {
            if (confirm('Are you sure you want to delete all annotations?')) {
                // Record the action with all current annotations
                undoStack.push({
                    type: 'clear',
                    data: [...annotations], // Clone the array
                });
                redoStack = []; // Clear redo stack
                updateUndoRedoButtons();

                annotations = [];
                currentAnnotation = null;
                selectedAnnotationIndex = null;
                updateAnnotationsList();
                redrawCanvas();
            }
        } else {
            alert('There are no annotations to clear.');
        }
    });

    // Navigation buttons
    prevButton.addEventListener('click', () => {
        navigateToImage(currentIndex - 1);
    });

    nextButton.addEventListener('click', () => {
        navigateToImage(currentIndex + 1);
    });

    function navigateToImage(index) {
        if (index >= 0 && index < imageListFromDjango.length) {
            const newImageId = imageListFromDjango[index];
            window.location.href = `/annotate/${newImageId}/`;
        } else {
            alert('No more images.');
        }
    }

    // Redraw the canvas with the image and annotations
    function redrawCanvas() {
        if (!imageLoaded) return;

        // Clear the canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw the image
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

        // Draw all validated annotations
        annotations.forEach((ann, index) => {
            let color = classColors[ann.class_id] || 'blue';
            let lineWidth = 3;

            if (index === selectedAnnotationIndex) {
                // Highlight the selected annotation
                color = 'orange'; // Use a distinct color
                lineWidth = 4;
            }

            drawBoundingBox(ann, color, lineWidth);
        });

        // Draw the current annotation being drawn or adjusted
        if (currentAnnotation) {
            drawBoundingBox(currentAnnotation, classColors[currentAnnotation.class_id] || 'red', 3, true);
        }
    }

    // Draw a single bounding box
    function drawBoundingBox(ann, color, lineWidth = 3, isCurrent = false) {
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        const x = Math.min(ann.x_start, ann.x_end);
        const y = Math.min(ann.y_start, ann.y_end);
        const width = Math.abs(ann.x_end - ann.x_start);
        const height = Math.abs(ann.y_end - ann.y_start);
        ctx.strokeRect(x, y, width, height);

        if (isCurrent) {
            // Draw resize handles
            drawHandles(ann);
        }
    }

    // Draw resize handles on the bounding box
    function drawHandles(ann) {
        const handles = getHandlesCoordinates(ann);
        ctx.fillStyle = 'white';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 1;

        for (let handle in handles) {
            const { x, y } = handles[handle];
            ctx.fillRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize);
            ctx.strokeRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize);
        }
    }

    // Get the coordinates of the resize handles
    function getHandlesCoordinates(ann) {
        const x_start = ann.x_start;
        const y_start = ann.y_start;
        const x_end = ann.x_end;
        const y_end = ann.y_end;
        const x_center = (x_start + x_end) / 2;
        const y_center = (y_start + y_end) / 2;

        return {
            nw: { x: x_start, y: y_start },
            n: { x: x_center, y: y_start },
            ne: { x: x_end, y: y_start },
            e: { x: x_end, y: y_center },
            se: { x: x_end, y: y_end },
            s: { x: x_center, y: y_end },
            sw: { x: x_start, y: y_end },
            w: { x: x_start, y: y_center },
        };
    }

    // Check if the mouse is over a handle
    function getHandleUnderMouse(x, y, ann) {
        const handles = getHandlesCoordinates(ann);
        for (let handle in handles) {
            const hx = handles[handle].x;
            const hy = handles[handle].y;
            if (x >= hx - handleSize / 2 && x <= hx + handleSize / 2 &&
                y >= hy - handleSize / 2 && y <= hy + handleSize / 2) {
                return handle;
            }
        }
        return null;
    }

    // Get cursor style based on handle
    function getCursorForHandle(handle) {
        const cursors = {
            n: 'ns-resize',
            s: 'ns-resize',
            e: 'ew-resize',
            w: 'ew-resize',
            ne: 'nesw-resize',
            sw: 'nesw-resize',
            nw: 'nwse-resize',
            se: 'nwse-resize',
        };
        return cursors[handle] || 'default';
    }

    // Resize the bounding box based on handle and mouse position
    function resizeBoundingBox(ann, handle, x, y) {
        switch (handle) {
            case 'n':
                ann.y_start = y;
                break;
            case 's':
                ann.y_end = y;
                break;
            case 'e':
                ann.x_end = x;
                break;
            case 'w':
                ann.x_start = x;
                break;
            case 'ne':
                ann.x_end = x;
                ann.y_start = y;
                break;
            case 'nw':
                ann.x_start = x;
                ann.y_start = y;
                break;
            case 'se':
                ann.x_end = x;
                ann.y_end = y;
                break;
            case 'sw':
                ann.x_start = x;
                ann.y_end = y;
                break;
            default:
                break;
        }

        // Optional: Add constraints to prevent negative widths/heights
        if (ann.x_end < ann.x_start) {
            [ann.x_start, ann.x_end] = [ann.x_end, ann.x_start];
        }
        if (ann.y_end < ann.y_start) {
            [ann.y_start, ann.y_end] = [ann.y_end, ann.y_start];
        }
    }

    // Convert the annotation to the desired format (YOLO TXT format)
    function convertAnnotation(ann) {
        const x_center = ((ann.x_start + ann.x_end) / 2 / canvas.width).toFixed(6);
        const y_center = ((ann.y_start + ann.y_end) / 2 / canvas.height).toFixed(6);
        const width = (Math.abs(ann.x_end - ann.x_start) / canvas.width).toFixed(6);
        const height = (Math.abs(ann.y_end - ann.y_start) / canvas.height).toFixed(6);

        return {
            class_id: ann.class_id,
            x_center: x_center,
            y_center: y_center,
            width: width,
            height: height,
        };
    }

    // Load existing annotations from the server in TXT format
    function loadAnnotations() {
        fetch(annotationsFileUrl)
            .then(response => {
                if (response.ok) {
                    return response.text();
                } else {
                    throw new Error('No existing annotations.');
                }
            })
            .then(data => {
                parseAnnotations(data);
                updateAnnotationsList();
                redrawCanvas();
            })
            .catch(error => {
                console.log(error.message);
            });
    }

    // Parse annotations from the loaded TXT data
    function parseAnnotations(data) {
        const lines = data.trim().split('\n');
        lines.forEach(line => {
            const [class_id, x_center, y_center, width, height] = line.split(' ').map(Number);
            const ann = {
                class_id: class_id,
                x_center: x_center,
                y_center: y_center,
                width: width,
                height: height,
                x_start: (x_center - width / 2) * canvas.width,
                y_start: (y_center - height / 2) * canvas.height,
                x_end: (x_center + width / 2) * canvas.width,
                y_end: (y_center + height / 2) * canvas.height,
            };
            annotations.push(ann);
        });
    }
    function updateAnnotationsList() {
        annotationList.innerHTML = ''; // Clear existing items
    
        // Reset class counters
        let classCounters = {};
    
        annotations.forEach((ann, index) => {
            const classId = ann.class_id.toString(); // Ensure classId is a string to match keys in classIdToName
            const className = classIdToName[classId];
    
            // Update class counter
            if (!classCounters[classId]) {
                classCounters[classId] = 1;
            } else {
                classCounters[classId]++;
            }
    
            const count = classCounters[classId];
            const listItem = document.createElement('li');
            listItem.textContent = `${className} ${count}`;
            listItem.dataset.index = index; // Store index in data attribute
    
            // Highlight if selected
            if (index === selectedAnnotationIndex) {
                listItem.classList.add('selected-annotation');
            }
    
            // Add click event listener
            listItem.addEventListener('click', () => {
                selectedAnnotationIndex = index;
                currentAnnotation = null; // Deselect any ongoing annotation
                updateAnnotationsList();
                redrawCanvas();
            });
    
            annotationList.appendChild(listItem);
        });
    }
    
    // Function to update the disabled state of Undo and Redo buttons
    function updateUndoRedoButtons() {
        undoButton.disabled = undoStack.length === 0;
        redoButton.disabled = redoStack.length === 0;
    }

    // Call updateUndoRedoButtons initially
    updateUndoRedoButtons();

    // Redraw the canvas with the image and annotations
    function redrawCanvas() {
        if (!imageLoaded) return;

        // Clear the canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw the image
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

        // Draw all validated annotations
        annotations.forEach((ann, index) => {
            let color = classColors[ann.class_id] || 'blue';
            let lineWidth = 3;

            if (index === selectedAnnotationIndex) {
                // Highlight the selected annotation
                color = 'orange'; // Use a distinct color
                lineWidth = 4;
            }

            drawBoundingBox(ann, color, lineWidth);
        });

        // Draw the current annotation being drawn or adjusted
        if (currentAnnotation) {
            drawBoundingBox(currentAnnotation, classColors[currentAnnotation.class_id] || 'red', 3, true);
        }
    }

    // Draw a single bounding box
    function drawBoundingBox(ann, color, lineWidth = 3, isCurrent = false) {
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        const x = Math.min(ann.x_start, ann.x_end);
        const y = Math.min(ann.y_start, ann.y_end);
        const width = Math.abs(ann.x_end - ann.x_start);
        const height = Math.abs(ann.y_end - ann.y_start);
        ctx.strokeRect(x, y, width, height);

        if (isCurrent) {
            // Draw resize handles
            drawHandles(ann);
        }
    }

    // Draw resize handles on the bounding box
    function drawHandles(ann) {
        const handles = getHandlesCoordinates(ann);
        ctx.fillStyle = 'white';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 1;

        for (let handle in handles) {
            const { x, y } = handles[handle];
            ctx.fillRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize);
            ctx.strokeRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize);
        }
    }

    // Get the coordinates of the resize handles
    function getHandlesCoordinates(ann) {
        const x_start = ann.x_start;
        const y_start = ann.y_start;
        const x_end = ann.x_end;
        const y_end = ann.y_end;
        const x_center = (x_start + x_end) / 2;
        const y_center = (y_start + y_end) / 2;

        return {
            nw: { x: x_start, y: y_start },
            n: { x: x_center, y: y_start },
            ne: { x: x_end, y: y_start },
            e: { x: x_end, y: y_center },
            se: { x: x_end, y: y_end },
            s: { x: x_center, y: y_end },
            sw: { x: x_start, y: y_end },
            w: { x: x_start, y: y_center },
        };
    }

    // Check if the mouse is over a handle
    function getHandleUnderMouse(x, y, ann) {
        const handles = getHandlesCoordinates(ann);
        for (let handle in handles) {
            const hx = handles[handle].x;
            const hy = handles[handle].y;
            if (x >= hx - handleSize / 2 && x <= hx + handleSize / 2 &&
                y >= hy - handleSize / 2 && y <= hy + handleSize / 2) {
                return handle;
            }
        }
        return null;
    }

    // Get cursor style based on handle
    function getCursorForHandle(handle) {
        const cursors = {
            n: 'ns-resize',
            s: 'ns-resize',
            e: 'ew-resize',
            w: 'ew-resize',
            ne: 'nesw-resize',
            sw: 'nesw-resize',
            nw: 'nwse-resize',
            se: 'nwse-resize',
        };
        return cursors[handle] || 'default';
    }

    // Resize the bounding box based on handle and mouse position
    function resizeBoundingBox(ann, handle, x, y) {
        switch (handle) {
            case 'n':
                ann.y_start = y;
                break;
            case 's':
                ann.y_end = y;
                break;
            case 'e':
                ann.x_end = x;
                break;
            case 'w':
                ann.x_start = x;
                break;
            case 'ne':
                ann.x_end = x;
                ann.y_start = y;
                break;
            case 'nw':
                ann.x_start = x;
                ann.y_start = y;
                break;
            case 'se':
                ann.x_end = x;
                ann.y_end = y;
                break;
            case 'sw':
                ann.x_start = x;
                ann.y_end = y;
                break;
            default:
                break;
        }

        // Optional: Add constraints to prevent negative widths/heights
        if (ann.x_end < ann.x_start) {
            [ann.x_start, ann.x_end] = [ann.x_end, ann.x_start];
        }
        if (ann.y_end < ann.y_start) {
            [ann.y_start, ann.y_end] = [ann.y_end, ann.y_start];
        }
    }

    // Save annotations in YOLO TXT format
    saveButton.addEventListener('click', () => {
        if (!annotations.length) {
            alert('No annotations to save.');
            return;
        }

        // Prepare annotations data for saving in YOLO TXT format
        const annotationsToSave = annotations.map(ann => {
            const x_center = ((ann.x_start + ann.x_end) / 2 / canvas.width).toFixed(6);
            const y_center = ((ann.y_start + ann.y_end) / 2 / canvas.height).toFixed(6);
            const width = (Math.abs(ann.x_end - ann.x_start) / canvas.width).toFixed(6);
            const height = (Math.abs(ann.y_end - ann.y_start) / canvas.height).toFixed(6);

            return `${ann.class_id} ${x_center} ${y_center} ${width} ${height}`;
        }).join('\n');

        // Send the annotations array to the server via AJAX POST request
        fetch(saveAnnotationsUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken, // Ensure CSRF token is included
            },
            body: JSON.stringify({
                imageId: imageId,
                annotations: annotationsToSave,
            }),
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                alert('Annotations saved successfully.');
                // Optionally redirect to the next image or update the UI
            } else {
                alert('Failed to save annotations.');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('An error occurred while saving annotations.');
        });
    });

    // Undo the last action
    undoButton.addEventListener('click', () => {
        if (undoStack.length > 0) {
            const action = undoStack.pop();
            redoStack.push(action);
            updateUndoRedoButtons();

            switch (action.type) {
                case 'add':
                    // Remove the added annotation
                    annotations = annotations.filter(ann => ann !== action.data);
                    break;
                case 'delete':
                    // Re-add the deleted annotation
                    annotations.push(action.data);
                    break;
                case 'modify':
                    // Revert to the previous state
                    annotations = annotations.filter(ann => ann !== action.data);
                    annotations.push(action.previousData);
                    break;
                case 'clear':
                    // Restore the annotations
                    annotations = action.data;
                    break;
                default:
                    break;
            }
            selectedAnnotationIndex = null;
            updateAnnotationsList();
            redrawCanvas();
        } else {
            alert('No actions to undo.');
        }
    });

    // Redo the last undone action
    redoButton.addEventListener('click', () => {
        if (redoStack.length > 0) {
            const action = redoStack.pop();
            undoStack.push(action);
            updateUndoRedoButtons();

            switch (action.type) {
                case 'add':
                    // Re-add the annotation
                    annotations.push(action.data);
                    break;
                case 'delete':
                    // Remove the annotation
                    annotations = annotations.filter(ann => ann !== action.data);
                    break;
                case 'modify':
                    // Apply the modification
                    annotations = annotations.filter(ann => ann !== action.previousData);
                    annotations.push(action.data);
                    break;
                case 'clear':
                    // Remove all annotations
                    annotations = [];
                    break;
                default:
                    break;
            }
            selectedAnnotationIndex = null;
            updateAnnotationsList();
            redrawCanvas();
        } else {
            alert('No actions to redo.');
        }
    });

    // Modify selected annotation
    modifyButton.addEventListener('click', () => {
        if (selectedAnnotationIndex !== null) {
            // Store the previous state
            const previousAnnotation = { ...annotations[selectedAnnotationIndex] };

            // Set the selected annotation as the current annotation for modification
            currentAnnotation = { ...annotations[selectedAnnotationIndex] };

            // Store previous data in currentAnnotation
            currentAnnotation.previousData = previousAnnotation;

            // Remove it from the annotations array
            annotations.splice(selectedAnnotationIndex, 1);

            // Reset the selected annotation index
            selectedAnnotationIndex = null;

            updateAnnotationsList();
            redrawCanvas();
        } else {
            alert('Please select an annotation to modify.');
        }
    });

    // Delete selected annotation
    deleteButton.addEventListener('click', () => {
        if (selectedAnnotationIndex !== null) {
            // Get the annotation to delete
            const deletedAnnotation = annotations[selectedAnnotationIndex];

            // Remove the selected annotation from the annotations array
            annotations.splice(selectedAnnotationIndex, 1);

            // Record the action
            undoStack.push({
                type: 'delete',
                data: deletedAnnotation,
            });
            redoStack = []; // Clear redo stack
            updateUndoRedoButtons();

            // Reset the selected annotation index
            selectedAnnotationIndex = null;

            updateAnnotationsList();
            redrawCanvas();
        } else {
            alert('Please select an annotation to delete.');
        }
    });

    // Clear all annotations
    clearButton.addEventListener('click', () => {
        if (annotations.length > 0) {
            if (confirm('Are you sure you want to delete all annotations?')) {
                // Record the action with all current annotations
                undoStack.push({
                    type: 'clear',
                    data: [...annotations], // Clone the array
                });
                redoStack = []; // Clear redo stack
                updateUndoRedoButtons();

                annotations = [];
                currentAnnotation = null;
                selectedAnnotationIndex = null;
                updateAnnotationsList();
                redrawCanvas();
            }
        } else {
            alert('There are no annotations to clear.');
        }
    });

    // Navigation buttons
    prevButton.addEventListener('click', () => {
        navigateToImage(currentIndex - 1);
    });

    nextButton.addEventListener('click', () => {
        navigateToImage(currentIndex + 1);
    });

    function navigateToImage(index) {
        if (index >= 0 && index < imageListFromDjango.length) {
            const newImageId = imageListFromDjango[index];
            window.location.href = `/annotate/${newImageId}/`;
        } else {
            alert('No more images.');
        }
    }

    // Redraw the canvas with the image and annotations
    function redrawCanvas() {
        if (!imageLoaded) return;

        // Clear the canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw the image
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

        // Draw all validated annotations
        annotations.forEach((ann, index) => {
            let color = classColors[ann.class_id] || 'blue';
            let lineWidth = 3;

            if (index === selectedAnnotationIndex) {
                // Highlight the selected annotation
                color = 'orange'; // Use a distinct color
                lineWidth = 4;
            }

            drawBoundingBox(ann, color, lineWidth);
        });

        // Draw the current annotation being drawn or adjusted
        if (currentAnnotation) {
            drawBoundingBox(currentAnnotation, classColors[currentAnnotation.class_id] || 'red', 3, true);
        }
    }

    // Draw a single bounding box
    function drawBoundingBox(ann, color, lineWidth = 3, isCurrent = false) {
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        const x = Math.min(ann.x_start, ann.x_end);
        const y = Math.min(ann.y_start, ann.y_end);
        const width = Math.abs(ann.x_end - ann.x_start);
        const height = Math.abs(ann.y_end - ann.y_start);
        ctx.strokeRect(x, y, width, height);

        if (isCurrent) {
            // Draw resize handles
            drawHandles(ann);
        }
    }

    // Draw resize handles on the bounding box
    function drawHandles(ann) {
        const handles = getHandlesCoordinates(ann);
        ctx.fillStyle = 'white';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 1;

        for (let handle in handles) {
            const { x, y } = handles[handle];
            ctx.fillRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize);
            ctx.strokeRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize);
        }
    }

    // Get the coordinates of the resize handles
    function getHandlesCoordinates(ann) {
        const x_start = ann.x_start;
        const y_start = ann.y_start;
        const x_end = ann.x_end;
        const y_end = ann.y_end;
        const x_center = (x_start + x_end) / 2;
        const y_center = (y_start + y_end) / 2;

        return {
            nw: { x: x_start, y: y_start },
            n: { x: x_center, y: y_start },
            ne: { x: x_end, y: y_start },
            e: { x: x_end, y: y_center },
            se: { x: x_end, y: y_end },
            s: { x: x_center, y: y_end },
            sw: { x: x_start, y: y_end },
            w: { x: x_start, y: y_center },
        };
    }

    // Check if the mouse is over a handle
    function getHandleUnderMouse(x, y, ann) {
        const handles = getHandlesCoordinates(ann);
        for (let handle in handles) {
            const hx = handles[handle].x;
            const hy = handles[handle].y;
            if (x >= hx - handleSize / 2 && x <= hx + handleSize / 2 &&
                y >= hy - handleSize / 2 && y <= hy + handleSize / 2) {
                return handle;
            }
        }
        return null;
    }

    // Get cursor style based on handle
    function getCursorForHandle(handle) {
        const cursors = {
            n: 'ns-resize',
            s: 'ns-resize',
            e: 'ew-resize',
            w: 'ew-resize',
            ne: 'nesw-resize',
            sw: 'nesw-resize',
            nw: 'nwse-resize',
            se: 'nwse-resize',
        };
        return cursors[handle] || 'default';
    }

    // Resize the bounding box based on handle and mouse position
    function resizeBoundingBox(ann, handle, x, y) {
        switch (handle) {
            case 'n':
                ann.y_start = y;
                break;
            case 's':
                ann.y_end = y;
                break;
            case 'e':
                ann.x_end = x;
                break;
            case 'w':
                ann.x_start = x;
                break;
            case 'ne':
                ann.x_end = x;
                ann.y_start = y;
                break;
            case 'nw':
                ann.x_start = x;
                ann.y_start = y;
                break;
            case 'se':
                ann.x_end = x;
                ann.y_end = y;
                break;
            case 'sw':
                ann.x_start = x;
                ann.y_end = y;
                break;
            default:
                break;
        }

        // Optional: Add constraints to prevent negative widths/heights
        if (ann.x_end < ann.x_start) {
            [ann.x_start, ann.x_end] = [ann.x_end, ann.x_start];
        }
        if (ann.y_end < ann.y_start) {
            [ann.y_start, ann.y_end] = [ann.y_end, ann.y_start];
        }
    }

    // Update the annotations list displayed on the right side
    function updateAnnotationsList() {
        // Get the containers for each class
        const personList = document.getElementById('person-annotations');
        const helmetList = document.getElementById('helmet-annotations');
        const vestList = document.getElementById('vest-annotations');
    
        // Clear existing items in each list
        personList.innerHTML = '';
        helmetList.innerHTML = '';
        vestList.innerHTML = '';
    
        // Reset class counters
        let classCounters = {};
    
        annotations.forEach((ann, index) => {
            const classId = ann.class_id.toString(); // Ensure classId is a string to match keys in classIdToName
            const className = classIdToName[classId];
    
            // Update class counter
            if (!classCounters[classId]) {
                classCounters[classId] = 1;
            } else {
                classCounters[classId]++;
            }
    
            const count = classCounters[classId];
            const listItem = document.createElement('li');
            listItem.textContent = `${className} ${count}`;
            listItem.dataset.index = index; // Store index in data attribute
    
            // Highlight if selected
            if (index === selectedAnnotationIndex) {
                listItem.classList.add('selected-annotation');
            }
    
            // Add click event listener
            listItem.addEventListener('click', () => {
                selectedAnnotationIndex = index;
                currentAnnotation = null; // Deselect any ongoing annotation
                updateAnnotationsList();
                redrawCanvas();
            });
    
            // Append the list item to the correct list based on class
            if (classId === '0') {
                personList.appendChild(listItem);
            } else if (classId === '1') {
                helmetList.appendChild(listItem);
            } else if (classId === '2') {
                vestList.appendChild(listItem);
            }
        });
    }
    

    // Function to update the disabled state of Undo and Redo buttons
    function updateUndoRedoButtons() {
        undoButton.disabled = undoStack.length === 0;
        redoButton.disabled = redoStack.length === 0;
    }

    // Call updateUndoRedoButtons initially
    updateUndoRedoButtons();

    // Load existing annotations from the server in TXT format
    function loadAnnotations() {
        fetch(annotationsFileUrl)
            .then(response => {
                if (response.ok) {
                    return response.text();
                } else {
                    throw new Error('No existing annotations.');
                }
            })
            .then(data => {
                parseAnnotations(data);
                updateAnnotationsList();
                redrawCanvas();
            })
            .catch(error => {
                console.log(error.message);
            });
    }

    // Parse annotations from the loaded TXT data
    function parseAnnotations(data) {
        const lines = data.trim().split('\n');
        lines.forEach(line => {
            const [class_id, x_center, y_center, width, height] = line.split(' ').map(Number);
            const ann = {
                class_id: class_id,
                x_center: x_center,
                y_center: y_center,
                width: width,
                height: height,
                x_start: (x_center - width / 2) * canvas.width,
                y_start: (y_center - height / 2) * canvas.height,
                x_end: (x_center + width / 2) * canvas.width,
                y_end: (y_center + height / 2) * canvas.height,
            };
            annotations.push(ann);
        });
    }

    // Helper function to check if a point is inside a bounding box
    function isPointInBoundingBox(x, y, ann) {
        const x_min = Math.min(ann.x_start, ann.x_end);
        const x_max = Math.max(ann.x_start, ann.x_end);
        const y_min = Math.min(ann.y_start, ann.y_end);
        const y_max = Math.max(ann.y_start, ann.y_end);
        return x >= x_min && x <= x_max && y >= y_min && y <= y_max;
    }

    // Helper function to get the CSRF token from cookies (if needed)
    function getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (const cookie of cookies) {
                const trimmedCookie = cookie.trim();
                if (trimmedCookie.startsWith(name + '=')) {
                    cookieValue = decodeURIComponent(trimmedCookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }

});
