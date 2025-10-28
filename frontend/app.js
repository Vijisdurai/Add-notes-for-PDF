const API_BASE = window.location.origin;

let currentDocId = null;
let currentDocType = 'pdf';
let currentPage = 1;
let totalPages = 1;
let pdfDocument = null;
let notes = [];
let currentScale = 1;
let currentBaseWidth = 0;
let currentBaseHeight = 0;
let currentImageMeta = null;
let currentTranslateX = 0;
let currentTranslateY = 0;
const documentCache = {};
const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const SCALE_STEP = 0.2;
const DEFAULT_NOTE_COLOR = '#fbbf24';
const SUPPORTED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.webp'];
let lastUsedColor = DEFAULT_NOTE_COLOR;
let isPanning = false;
const panStart = { x: 0, y: 0 };
const panOffsetStart = { x: 0, y: 0 };

let notesVisible = true; // Default state is visible
let addNotesMode = false; // Default: can't add notes by clicking

document.addEventListener('DOMContentLoaded', () => {
    // Initialize UI
    loadDocuments();
    initializePageControls();

    // Add event listeners
    document.getElementById('search-btn').addEventListener('click', searchDocuments);
    document.getElementById('upload').addEventListener('change', uploadDocument);
    document.getElementById('back-to-vault').addEventListener('click', showVault);
    document.getElementById('save-note').addEventListener('click', saveNote);
    document.getElementById('cancel-note').addEventListener('click', hideModal);
    document.getElementById('close-modal').addEventListener('click', hideModal);
    
    // Add toggle for Add Notes Mode
    document.getElementById('toggle-add-mode').addEventListener('change', (e) => {
        addNotesMode = e.target.checked;
        syncClickLayerState();
        if (addNotesMode) {
            console.log('✏️ Add Notes Mode: ENABLED - Click anywhere to add notes');
            showNotification('Add Notes Mode enabled. Click anywhere on the surface to add a note.', 'success');
        } else {
            console.log('🔒 Add Notes Mode: DISABLED - Click layer is off');
            showNotification('Add Notes Mode disabled. You can only view and edit existing notes.', 'info');
        }
    });
    
    // Add toggle notes functionality
    document.getElementById('toggle-notes').addEventListener('change', (e) => {
        notesVisible = e.target.checked;
        const overlay = document.getElementById('note-overlay');
        overlay.style.display = notesVisible ? 'block' : 'none';
        console.log('Notes visibility set to:', notesVisible);
    });
    
    // Add keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // For note modal
        if (!document.getElementById('note-modal').classList.contains('hidden')) {
            if (e.key === 'Escape') {
                hideModal();
            } else if (e.key === 'Enter' && e.ctrlKey) {
                saveNote();
            }
            return;
        }
        
        // For PDF navigation
        if (!document.getElementById('viewer').classList.contains('hidden')) {
            if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
                if (currentPage > 1) {
                    currentPage--;
                    renderCurrentPage();
                }
            } else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
                if (currentPage < totalPages) {
                    currentPage++;
                    renderCurrentPage();
                }
            }
        }
    });

    // Zoom controls (used for images)
    document.getElementById('zoom-in').addEventListener('click', () => adjustZoom(SCALE_STEP));
    document.getElementById('zoom-out').addEventListener('click', () => adjustZoom(-SCALE_STEP));
    document.getElementById('zoom-reset').addEventListener('click', resetZoom);

    const clickLayer = document.getElementById('click-layer');
    if (clickLayer) {
        clickLayer.addEventListener('click', handleCanvasClick);
        clickLayer.addEventListener('mousedown', beginPan);
        clickLayer.addEventListener('mousemove', panMove);
        clickLayer.addEventListener('mouseup', endPan);
        clickLayer.addEventListener('mouseleave', endPan);
    }

    const prevButton = document.getElementById('prev-page');
    const nextButton = document.getElementById('next-page');
    if (prevButton) {
        prevButton.addEventListener('click', goToPreviousPage);
    }
    if (nextButton) {
        nextButton.addEventListener('click', goToNextPage);
    }

    syncClickLayerState();
});

// Initialize page controls
function initializePageControls() {
    // Setup initial page info
    document.getElementById('current-page-num').textContent = '1';
    document.getElementById('total-pages').textContent = '1';
    
    // Hide loading indicator initially
    if (document.getElementById('pdf-loading')) {
        document.getElementById('pdf-loading').classList.add('hidden');
    }
}

function updatePageInfo() {
    document.getElementById('current-page-num').textContent = currentPage;
    document.getElementById('total-pages').textContent = totalPages;
}

function setDocumentControls(docType) {
    const pageNav = document.getElementById('page-nav');
    const zoomControls = document.getElementById('zoom-controls');

    if (pageNav) {
        pageNav.classList.toggle('hidden', docType !== 'pdf');
    }

    if (zoomControls) {
        zoomControls.classList.toggle('hidden', docType !== 'image');
    }
}

function updateStageDimensions(width, height) {
    currentBaseWidth = width;
    currentBaseHeight = height;

    const stage = document.getElementById('visual-stage');
    const surface = document.getElementById('visual-surface');
    const overlay = document.getElementById('note-overlay');
    const clickLayer = document.getElementById('click-layer');

    if (stage) {
        stage.style.width = `${width}px`;
        stage.style.height = `${height}px`;
    }

    if (surface) {
        surface.style.width = `${width}px`;
        surface.style.height = `${height}px`;
    }

    if (overlay) {
        overlay.style.width = `${width}px`;
        overlay.style.height = `${height}px`;
    }

    if (clickLayer) {
        clickLayer.style.width = `${width}px`;
        clickLayer.style.height = `${height}px`;
    }

    clampPanOffsets();
    applyScale();
}

function applyScale() {
    const stage = document.getElementById('visual-stage');
    if (!stage) return;
    stage.style.transform = `translate(${currentTranslateX}px, ${currentTranslateY}px) scale(${currentScale})`;
}

function resetZoom() {
    currentScale = 1;
    currentTranslateX = 0;
    currentTranslateY = 0;
    applyScale();
}

function adjustZoom(delta) {
    if (currentDocType !== 'image') return;
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, parseFloat((currentScale + delta).toFixed(2))));
    if (Math.abs(newScale - currentScale) < 0.01) {
        return;
    }
    currentScale = newScale;
    clampPanOffsets();
    applyScale();
    syncClickLayerState();
}

function syncClickLayerState() {
    const clickLayer = document.getElementById('click-layer');
    if (!clickLayer) return;
    if (currentDocType === 'image' && !addNotesMode) {
        clickLayer.style.pointerEvents = 'auto';
    } else {
        clickLayer.style.pointerEvents = addNotesMode ? 'auto' : 'none';
    }

    if (currentDocType === 'image' && isPanning) {
        clickLayer.style.cursor = 'grabbing';
    } else if (currentDocType === 'image' && !addNotesMode) {
        clickLayer.style.cursor = currentScale > 1 ? 'grab' : 'default';
    } else {
        clickLayer.style.cursor = addNotesMode ? 'crosshair' : 'default';
    }
}

function resetViewerState() {
    // Reset zoom
    resetZoom();
    currentImageMeta = null;

    const surface = document.getElementById('visual-surface');
    if (surface) {
        surface.innerHTML = '';
    }

    updateStageDimensions(0, 0);
}

function goToPreviousPage() {
    if (currentDocType !== 'pdf') return;
    if (currentPage > 1) {
        currentPage--;
        renderCurrentPage();
    }
}

function goToNextPage() {
    if (currentDocType !== 'pdf') return;
    if (currentPage < totalPages) {
        currentPage++;
        renderCurrentPage();
    }
}

function isPathOnNoteOrControl(path) {
    return path.some(el => {
        if (!el) return false;
        if (el.classList && (el.classList.contains('note-icon') || el.classList.contains('note-container') || el.classList.contains('note-tooltip'))) {
            return true;
        }
        if (el.id && (el.id === 'prev-page' || el.id === 'next-page' || el.id === 'page-info' || el.id === 'page-controls')) {
            return true;
        }
        return false;
    });
}

function handleCanvasClick(e) {
    if (isPanning) {
        return;
    }
    if (currentDocType === 'image' && currentScale > 1 && !addNotesMode) {
        // Clicks should initiate panning instead of notes unless in add mode.
        return;
    }
    if (!addNotesMode) {
        console.log('Add Notes Mode is disabled, ignoring click');
        return;
    }

    if (!notesVisible) {
        console.log('Notes not visible, ignoring click');
        return;
    }

    const path = e.composedPath();
    if (isPathOnNoteOrControl(path)) {
        console.log('Clicked on existing note or controls, ignoring');
        return;
    }

    const clickLayer = document.getElementById('click-layer');
    if (!clickLayer) {
        console.error('Click layer not found');
        return;
    }

    const rect = clickLayer.getBoundingClientRect();
    const relativeX = (e.clientX - rect.left) / rect.width;
    const relativeY = (e.clientY - rect.top) / rect.height;

    if (Number.isNaN(relativeX) || Number.isNaN(relativeY)) {
        console.warn('Invalid click coordinates');
        return;
    }

    const notePoint = {
        page: currentDocType === 'pdf' ? currentPage : 1,
        coordinateSpace: currentDocType === 'pdf' ? 'normalized' : 'pixel'
    };

    if (notePoint.coordinateSpace === 'normalized') {
        notePoint.x = relativeX;
        notePoint.y = relativeY;
    } else {
        if (!currentBaseWidth || !currentBaseHeight) {
            console.warn('Missing base dimensions for image, cannot place note');
            return;
        }
        notePoint.x = relativeX * currentBaseWidth;
        notePoint.y = relativeY * currentBaseHeight;
        notePoint.refWidth = currentBaseWidth;
        notePoint.refHeight = currentBaseHeight;
    }

    addNote(notePoint);
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function clamp01(value) {
    return clamp(value, 0, 1);
}

function computeNormalizedPosition(note, overlayWidth, overlayHeight) {
    const space = note.coordinate_space || note.coordinateSpace || 'normalized';
    let x = parseFloat(note.x);
    let y = parseFloat(note.y);

    if (Number.isNaN(x) || Number.isNaN(y)) {
        return null;
    }

    if (space === 'pixel') {
        const refWidth = note.ref_width || note.refWidth || currentBaseWidth || overlayWidth;
        const refHeight = note.ref_height || note.refHeight || currentBaseHeight || overlayHeight;
        if (!refWidth || !refHeight) {
            return null;
        }
        x = x / refWidth;
        y = y / refHeight;
    }

    return {
        x: clamp01(x),
        y: clamp01(y)
    };
}

function getNoteColor(note) {
    return note.color || note.note_color || DEFAULT_NOTE_COLOR;
}

function beginPan(event) {
    if (currentDocType !== 'image' || addNotesMode) return;
    if (event.button !== 0) return; // left click only
    if (currentScale <= 1) return;
    isPanning = true;
    panStart.x = event.clientX;
    panStart.y = event.clientY;
    panOffsetStart.x = currentTranslateX;
    panOffsetStart.y = currentTranslateY;
    syncClickLayerState();
}

function panMove(event) {
    if (!isPanning) return;
    event.preventDefault();
    const dx = event.clientX - panStart.x;
    const dy = event.clientY - panStart.y;
    currentTranslateX = panOffsetStart.x + dx;
    currentTranslateY = panOffsetStart.y + dy;
    clampPanOffsets();
    applyScale();
}

function endPan() {
    if (!isPanning) return;
    isPanning = false;
    syncClickLayerState();
}

function clampPanOffsets() {
    if (currentDocType !== 'image') {
        currentTranslateX = 0;
        currentTranslateY = 0;
        return;
    }

    const container = document.getElementById('pdf-container');
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const contentWidth = currentBaseWidth * currentScale;
    const contentHeight = currentBaseHeight * currentScale;

    const minTranslateX = containerRect.width - contentWidth;
    const minTranslateY = containerRect.height - contentHeight;

    const clampedMinX = Math.min(0, minTranslateX);
    const clampedMinY = Math.min(0, minTranslateY);

    currentTranslateX = clamp(currentTranslateX, clampedMinX, 0);
    currentTranslateY = clamp(currentTranslateY, clampedMinY, 0);
}

async function loadDocuments() {
    try {
        // Show loading state
        const container = document.getElementById('documents');
        container.innerHTML = '<div class="flex justify-center p-8"><div class="spinner"></div></div>';
        
        const response = await fetch(`${API_BASE}/documents`);
        const documents = await response.json();

        // If no documents, show empty state
        if (documents.length === 0) {
            document.getElementById('empty-state').classList.remove('hidden');
            container.innerHTML = '';
            return;
        } else {
            document.getElementById('empty-state').classList.add('hidden');
        }
        
        // Build document grid with modern cards
        container.innerHTML = '';
        documents.forEach((doc, index) => {
            documentCache[doc.doc_id] = doc;
            const card = document.createElement('div');
            card.className = 'pdf-card';
            card.style.animationDelay = `${index * 0.1}s`;

            // Format the upload date
            const uploadDate = new Date(doc.upload_date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });

            card.innerHTML = `
                <div class="pdf-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd" />
                    </svg>
                </div>
                <div class="pdf-title" title="${doc.filename}">${doc.filename}</div>
                <div class="pdf-meta">
                    <div class="pdf-date">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        ${uploadDate}
                    </div>
                    <span class="ml-2 px-2 py-0.5 text-xs rounded-full bg-indigo-100 text-indigo-700">${(doc.type || 'pdf').toUpperCase()}</span>
                </div>
            `;

            card.addEventListener('click', () => {
                console.log('Document clicked:', doc.doc_id, doc.filename);
                openDocument(doc.doc_id);
            });

            container.appendChild(card);
        });
    } catch (error) {
        console.error('Error loading documents:', error);
        const container = document.getElementById('documents');
        container.innerHTML = `<div class="bg-red-100 text-red-700 p-4 rounded">Error loading documents: ${error.message}</div>`;
    }
}

async function searchDocuments() {
    try {
        const query = document.getElementById('search').value.toLowerCase();
        if (!query) {
            loadDocuments(); // If search is empty, show all documents
            return;
        }
        
        // Show loading state
        const container = document.getElementById('documents');
        container.innerHTML = '<div class="flex justify-center p-8"><div class="spinner"></div></div>';
        
        const response = await fetch(`${API_BASE}/documents`);
        const documents = await response.json();
        const filtered = documents.filter(doc => doc.filename.toLowerCase().includes(query));
        
        // If no results found
        if (filtered.length === 0) {
            document.getElementById('empty-state').classList.remove('hidden');
            document.getElementById('empty-state').innerHTML = `
                <div class="empty-state-icon">🔍</div>
                <div class="empty-state-text">No results found</div>
                <div class="empty-state-subtext">No documents match your search: "${query}"</div>
                <button id="clear-search" class="btn-primary mt-4">Clear Search</button>
            `;
            container.innerHTML = '';
            document.getElementById('clear-search').addEventListener('click', () => {
                document.getElementById('search').value = '';
                loadDocuments();
            });
            return;
        } else {
            document.getElementById('empty-state').classList.add('hidden');
        }
        
        // Display results with modern cards
        container.innerHTML = '';
        filtered.forEach((doc, index) => {
            const card = document.createElement('div');
            card.className = 'pdf-card';
            card.style.animationDelay = `${index * 0.1}s`;
            
            // Format the upload date
            const uploadDate = new Date(doc.upload_date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
            
            // Highlight matching text in filename
            const highlighted = doc.filename.replace(new RegExp(query, 'gi'), match => `<mark class="bg-yellow-200 px-1 rounded">${match}</mark>`);
            
            card.innerHTML = `
                <div class="pdf-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd" />
                    </svg>
                </div>
                <div class="pdf-title" title="${doc.filename}">${highlighted}</div>
                <div class="pdf-meta">
                    <div class="pdf-date">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        ${uploadDate}
                    </div>
                </div>
            `;
            
            card.addEventListener('click', () => {
                console.log('Document clicked:', doc.doc_id, doc.filename);
                documentCache[doc.doc_id] = doc;
                openDocument(doc.doc_id);
            });
            
            container.appendChild(card);
        });
        
        // Add results summary and clear button
        const resultsInfo = document.createElement('div');
        resultsInfo.className = 'bg-blue-50 p-3 rounded mb-4 flex justify-between items-center';
        resultsInfo.innerHTML = `
            <span>Found ${filtered.length} result${filtered.length === 1 ? '' : 's'} for "${query}"</span>
            <button id="clear-search" class="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm">Clear</button>
        `;
        container.insertAdjacentElement('afterbegin', resultsInfo);
        
        document.getElementById('clear-search').addEventListener('click', () => {
            document.getElementById('search').value = '';
            loadDocuments();
        });
    } catch (error) {
        console.error('Error searching documents:', error);
        const container = document.getElementById('documents');
        container.innerHTML = `<div class="bg-red-100 text-red-700 p-4 rounded">Error searching documents: ${error.message}</div>`;
    }
}

async function uploadDocument(event) {
    const file = event.target.files[0];
    if (!file) return;

    const extension = `.${file.name.split('.').pop()?.toLowerCase() || ''}`;
    if (!SUPPORTED_EXTENSIONS.includes(extension)) {
        showNotification(`Unsupported file type. Allowed types: ${SUPPORTED_EXTENSIONS.join(', ')}`, 'error');
        event.target.value = '';
        return;
    }

    try {
        const container = document.getElementById('documents');
        container.innerHTML = `
            <div class="text-center p-8 bg-white rounded shadow">
                <div class="spinner mx-auto mb-4"></div>
                <h3 class="text-lg font-medium text-gray-900">Uploading ${file.name}</h3>
                <p class="mt-1 text-sm text-gray-500">Please wait...</p>
            </div>
        `;

        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Upload failed: ${response.status} ${errorText}`);
        }

        const result = await response.json();

        // Cache newly uploaded doc metadata
        if (result.doc_id) {
            documentCache[result.doc_id] = {
                doc_id: result.doc_id,
                filename: result.filename || file.name,
                url: result.url,
                type: result.type || (extension === '.pdf' ? 'pdf' : 'image'),
                upload_date: new Date().toISOString()
            };
        }

        const notification = document.createElement('div');
        notification.className = 'fixed top-4 right-4 bg-green-100 border-l-4 border-green-500 text-green-700 p-4 rounded shadow-lg z-50';
        notification.innerHTML = `
            <div class="flex items-center">
                <svg class="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span>${result.message || 'Upload successful!'}</span>
            </div>
        `;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('opacity-0');
            setTimeout(() => notification.remove(), 300);
        }, 3000);

        await loadDocuments();
    } catch (error) {
        console.error('Error uploading document:', error);
        showNotification('Upload failed: ' + error.message, 'error');
        loadDocuments();
    } finally {
        event.target.value = '';
    }
}

function getDocumentMeta(docId) {
    if (documentCache[docId]) {
        return documentCache[docId];
    }
    return null;
}

async function openDocument(docId) {
    try {
        let meta = getDocumentMeta(docId);
        if (!meta) {
            const response = await fetch(`${API_BASE}/documents`);
            const documents = await response.json();
            documents.forEach(doc => {
                documentCache[doc.doc_id] = doc;
            });
            meta = documentCache[docId];
        }

        if (!meta) {
            throw new Error(`Document with ID ${docId} not found`);
        }

        if ((meta.type || 'pdf') === 'pdf') {
            await loadPDF(meta);
        } else {
            await loadImage(meta);
        }
    } catch (error) {
        console.error('Error opening document:', error);
        showNotification(`Failed to open document: ${error.message}`, 'error');
    }
}

async function loadPDF(docMeta) {
    try {
        document.getElementById('pdf-loading').classList.remove('hidden');

        console.log('Loading PDF for document ID:', docMeta.doc_id);
        currentDocId = docMeta.doc_id;
        currentDocType = docMeta.type || 'pdf';
        setDocumentControls(currentDocType);
        currentPage = 1;
        resetViewerState();
        document.getElementById('vault').classList.add('hidden');
        document.getElementById('viewer').classList.remove('hidden');

        document.getElementById('document-title').textContent = docMeta.filename;

        const url = `${API_BASE}${docMeta.url}`;
        const loadingTask = pdfjsLib.getDocument(url);
        pdfDocument = await loadingTask.promise;
        totalPages = pdfDocument.numPages;

        updatePageInfo();
        await renderCurrentPage();
        await loadNotes();
    } catch (error) {
        console.error('Error loading PDF:', error);
        showNotification(`Error loading PDF: ${error.message}`, 'error');
        showVault();
    } finally {
        document.getElementById('pdf-loading').classList.add('hidden');
    }
}

async function loadImage(docMeta) {
    try {
        document.getElementById('pdf-loading').classList.remove('hidden');

        console.log('Loading IMAGE for document ID:', docMeta.doc_id);
        currentDocId = docMeta.doc_id;
        currentDocType = docMeta.type || 'image';
        setDocumentControls(currentDocType);
        currentPage = 1;
        resetViewerState();
        document.getElementById('vault').classList.add('hidden');
        document.getElementById('viewer').classList.remove('hidden');

        document.getElementById('document-title').textContent = docMeta.filename;

        const url = `${API_BASE}${docMeta.url}`;
        const image = new Image();
        image.src = url;
        image.alt = docMeta.filename;
        image.className = 'block max-w-full h-auto';

        const surface = document.getElementById('visual-surface');
        surface.innerHTML = '';
        surface.appendChild(image);

        await new Promise((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = reject;
        });

        currentBaseWidth = image.naturalWidth;
        currentBaseHeight = image.naturalHeight;
        currentImageMeta = {
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight
        };

        console.log('🖼️ Image loaded:', currentImageMeta);

        updateStageDimensions(image.naturalWidth, image.naturalHeight);
        applyScale();

        await loadNotes();
    } catch (error) {
        console.error('Error loading image:', error);
        showNotification(`Error loading image: ${error.message}`, 'error');
        showVault();
    } finally {
        document.getElementById('pdf-loading').classList.add('hidden');
    }
}

async function renderCurrentPage() {
    try {
        document.getElementById('pdf-loading').classList.remove('hidden');
        updatePageInfo();

        // Get the page
        const page = await pdfDocument.getPage(currentPage);

        // Prepare canvas
        const surface = document.getElementById('visual-surface');
        const existingCanvas = surface.querySelector('canvas');
        if (existingCanvas) {
            existingCanvas.remove();
        }
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        // Calculate scale to fit container
        const viewport = page.getViewport({ scale: 1.5 });
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        canvas.style.display = 'block';
        
        // Render PDF page
        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };
        
        await page.render(renderContext).promise;
        
        surface.insertBefore(canvas, surface.firstChild || null);

        console.log('📄 Canvas rendered:', {
            width: canvas.width,
            height: canvas.height,
            containerRect: surface.getBoundingClientRect()
        });
        updateStageDimensions(canvas.width, canvas.height);

        // Load notes for current page
        await loadNotes();
    } catch (error) {
        console.error('Error rendering page:', error);
    } finally {
        document.getElementById('pdf-loading').classList.add('hidden');
    }
}

// PDF viewing is now handled by iframe

async function loadNotes() {
    try {
        const params = new URLSearchParams({ doc_id: currentDocId });
        if (currentDocType === 'pdf') {
            params.set('page', String(currentPage));
        }

        const response = await fetch(`${API_BASE}/notes?${params.toString()}`);
        notes = await response.json();
        renderNotes();
    } catch (error) {
        console.error('Error loading notes:', error);
        notes = [];
    }
}

function renderNotes() {
    const overlay = document.getElementById('note-overlay');
    if (!overlay) {
        console.error('Note overlay element not found!');
        return;
    }
    
    overlay.innerHTML = '';
    overlay.style.display = notesVisible ? 'block' : 'none';
    
    // Debug overlay dimensions
    console.log('🎨 Overlay dimensions:', {
        clientWidth: overlay.clientWidth,
        clientHeight: overlay.clientHeight,
        offsetWidth: overlay.offsetWidth,
        offsetHeight: overlay.offsetHeight,
        boundingRect: overlay.getBoundingClientRect(),
        computedStyle: {
            width: overlay.style.width,
            height: overlay.style.height,
            position: overlay.style.position,
            top: overlay.style.top,
            left: overlay.style.left
        }
    });
    
    if (notes.length === 0) {
        console.log('No notes to render');
        return;
    }
    
    console.log(`Rendering ${notes.length} notes:`, notes);
    
    notes.forEach(note => {
        try {
            const overlayWidth = overlay.clientWidth || overlay.offsetWidth;
            const overlayHeight = overlay.clientHeight || overlay.offsetHeight;
            const normalized = computeNormalizedPosition(note, overlayWidth, overlayHeight);

            if (!normalized) {
                console.error('Invalid note position:', note);
                return;
            }

            const color = getNoteColor(note);

            // Create note container with proper positioning
            const noteContainer = document.createElement('div');
            noteContainer.className = 'absolute note-container';
            noteContainer.style.left = `${normalized.x * 100}%`;
            noteContainer.style.top = `${normalized.y * 100}%`;
            noteContainer.style.transform = 'translate(-50%, -50%)';
            noteContainer.style.zIndex = '40'; // Ensure proper z-index
            
            // Add data attributes to container for easier hit testing
            noteContainer.dataset.noteId = note.id;
            
            // Create note icon as a button
            const icon = document.createElement('button');
            icon.className = 'w-10 h-10 rounded-full cursor-pointer note-icon flex items-center justify-center shadow-lg transition-all';
            icon.style.backgroundColor = color;
            icon.style.border = `3px solid ${color}`;
            icon.style.boxShadow = `0 4px 6px ${color}55`;
            icon.innerHTML = '<span class="text-lg font-bold">📝</span>';
            icon.title = 'Click to view/edit note';
            
            // Create tooltip with improved visibility and positioning
            const tooltip = document.createElement('div');
            tooltip.className = 'absolute bg-white p-3 rounded shadow-lg text-sm z-50 note-tooltip hidden transition-all duration-200 opacity-0';
            tooltip.style.bottom = '100%'; // Position above the icon
            tooltip.style.left = '50%';
            tooltip.style.transform = 'translateX(-50%) translateY(-8px)';
            tooltip.style.borderRadius = '8px';
            tooltip.style.border = '1px solid #ddd';
            tooltip.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
            tooltip.style.maxHeight = '200px';
            tooltip.style.maxWidth = '250px';
            tooltip.style.width = 'max-content';
            tooltip.style.minWidth = '120px';
            tooltip.style.overflowY = 'auto';
            tooltip.style.pointerEvents = 'none'; // Prevent tooltip from capturing mouse events
            
            // Format tooltip content
            if (note.content && note.content.length > 0) {
                tooltip.innerHTML = `<div class="font-medium mb-1">Note</div><div>${note.content}</div>`;
            } else {
                tooltip.innerHTML = `<div class="text-gray-500 italic">Empty note</div>`;
            }
            
            // Add hover effects with improved timing
            noteContainer.addEventListener('mouseenter', (e) => {
                e.stopPropagation(); // Stop event propagation
                console.log('Note hover start:', note.id);
                tooltip.classList.remove('hidden');
                // Use requestAnimationFrame for smoother transitions
                requestAnimationFrame(() => {
                    tooltip.classList.add('opacity-100');
                });
                // Add hover state to icon
                icon.classList.add('ring-2', 'ring-blue-400');
            });
            
            noteContainer.addEventListener('mouseleave', (e) => {
                e.stopPropagation(); // Stop event propagation
                console.log('Note hover end:', note.id);
                tooltip.classList.remove('opacity-100');
                // Remove hover state from icon
                icon.classList.remove('ring-2', 'ring-blue-400');
                // Delay hiding to allow for smooth fade out
                setTimeout(() => tooltip.classList.add('hidden'), 200);
            });
            
            // Add click handler to button to show note content
            icon.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent click from bubbling to container
                e.preventDefault(); // Prevent default action
                console.log('Note button clicked:', note.id);
                showNoteContent(note);
            });
            
            // Add elements to DOM
            noteContainer.appendChild(icon);
            noteContainer.appendChild(tooltip);
            overlay.appendChild(noteContainer);
            
            console.log(`Note ${note.id} rendered at ${x.toFixed(2)}, ${y.toFixed(2)}`);
        } catch (error) {
            console.error('Error rendering note:', error, note);
        }
    });
}

function showNoteContent(note) {
    // Create a modal to display the note content
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-white rounded-lg p-6 w-96 shadow-2xl relative">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-bold">Note Content</h3>
                <button id="close-view-modal" class="text-gray-500 hover:text-gray-700 text-xl">&times;</button>
            </div>
            <div class="bg-gray-50 p-4 rounded mb-4 max-h-64 overflow-y-auto">
                <p class="text-gray-800 whitespace-pre-wrap">${note.content || 'Empty note'}</p>
            </div>
            <div class="flex justify-end space-x-2">
                <button id="edit-note-btn" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-300">Edit</button>
                <button id="close-note-btn" class="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-300">Close</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close button handlers
    modal.querySelector('#close-view-modal').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.querySelector('#close-note-btn').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    // Edit button handler
    modal.querySelector('#edit-note-btn').addEventListener('click', () => {
        document.body.removeChild(modal);
        editNote(note.id);
    });
    
    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
    
    // Close on Escape key
    const keyHandler = (e) => {
        if (e.key === 'Escape') {
            document.body.removeChild(modal);
            document.removeEventListener('keydown', keyHandler);
        }
    };
    document.addEventListener('keydown', keyHandler);
}

async function addNote(notePoint) {
    // Show modal with empty content for new note
    const textarea = document.getElementById('note-content');
    textarea.value = '';
    const colorPicker = document.getElementById('note-color');
    colorPicker.value = lastUsedColor;
    document.getElementById('note-modal').classList.remove('hidden');
    
    // Focus on the textarea and place cursor in it
    setTimeout(() => {
        textarea.focus();
    }, 100);
    
    // Update save button to handle new note creation
    const saveButton = document.getElementById('save-note');
    saveButton.dataset.isNew = 'true';
    saveButton.dataset.notePayload = JSON.stringify(notePoint);
    
    // Remove delete button if it exists (new notes can't be deleted)
    const deleteBtn = document.querySelector('.delete-note-btn');
    if (deleteBtn) {
        deleteBtn.remove();
    }
}

async function editNote(noteId) {
    const note = notes.find(n => n.id == noteId);
    if (!note) {
        console.error('Note not found:', noteId);
        return;
    }
    
    // Set the content and show modal
    const textarea = document.getElementById('note-content');
    textarea.value = note.content;
    const colorPicker = document.getElementById('note-color');
    colorPicker.value = note.color || DEFAULT_NOTE_COLOR;
    document.getElementById('note-modal').classList.remove('hidden');
    
    // Focus on the textarea and place cursor at the end
    setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }, 100);
    
    // Set up save button for editing
    const saveButton = document.getElementById('save-note');
    saveButton.dataset.isNew = 'false';
    saveButton.dataset.noteId = noteId;
    
    // Check if delete button already exists
    const modalActions = document.querySelector('#note-modal .flex');
    let deleteBtn = modalActions.querySelector('.delete-note-btn');
    
    if (!deleteBtn) {
        // Add delete button functionality
        deleteBtn = document.createElement('button');
        deleteBtn.className = 'bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 delete-note-btn focus:outline-none focus:ring-2 focus:ring-red-300';
        deleteBtn.textContent = 'Delete';
        modalActions.prepend(deleteBtn);
    }
    
    // Update click handler for current note
    deleteBtn.onclick = () => deleteNote(noteId);
}

async function saveNote() {
    const saveButton = document.getElementById('save-note');
    const content = document.getElementById('note-content').value.trim();
    const colorPicker = document.getElementById('note-color');
    const chosenColor = colorPicker.value || DEFAULT_NOTE_COLOR;

    if (!content) {
        showNotification('Note content cannot be empty', 'error');
        return;
    }

    try {
        console.log('Saving note...');
        if (saveButton.dataset.isNew === 'true') {
            // Creating a new note
            const payload = JSON.parse(saveButton.dataset.notePayload || '{}');
            if (!payload || typeof payload.x !== 'number' || typeof payload.y !== 'number') {
                throw new Error('Invalid note payload');
            }

            const requestBody = {
                doc_id: currentDocId,
                page: payload.page,
                x: payload.x,
                y: payload.y,
                content,
                color: chosenColor,
                coordinate_space: payload.coordinateSpace,
                ref_width: payload.refWidth,
                ref_height: payload.refHeight
            };

            console.log('Creating new note:', requestBody);
            
            const response = await fetch(`${API_BASE}/notes`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(requestBody)
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server error: ${response.status} ${errorText}`);
            }
            
            const note = await response.json();
            console.log('Note created:', note);
            notes.push(note);
            lastUsedColor = chosenColor;
        } else {
            // Updating existing note
            const noteId = saveButton.dataset.noteId;
            const note = notes.find(n => n.id == noteId);
            
            if (!note) {
                throw new Error(`Note with ID ${noteId} not found`);
            }
            
            console.log('Updating note:', noteId);
            
            const response = await fetch(`${API_BASE}/notes/${noteId}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    doc_id: note.doc_id,
                    page: note.page,
                    x: note.x,
                    y: note.y,
                    content,
                    color: chosenColor,
                    coordinate_space: note.coordinate_space,
                    ref_width: note.ref_width,
                    ref_height: note.ref_height
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server error: ${response.status} ${errorText}`);
            }
            
            console.log('Note updated successfully');
            
            // Update the note in our local array
            note.content = content;
            note.color = chosenColor;
            lastUsedColor = chosenColor;
        }
        
        hideModal();
        renderNotes(); // Just re-render with our updated notes array
        showNotification('Note saved successfully!', 'success');
    } catch (error) {
        console.error('Error saving note:', error);
        showNotification('Failed to save note: ' + error.message, 'error');
    }
}

async function deleteNote(noteId) {
    if (confirm('Delete note?')) {
        try {
            console.log('Deleting note:', noteId);
            const response = await fetch(`${API_BASE}/notes/${noteId}`, {method: 'DELETE'});
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server error: ${response.status} ${errorText}`);
            }
            
            console.log('Note deleted successfully');
            
            // Remove the note from our local array
            notes = notes.filter(n => n.id != noteId);
            
            hideModal();
            renderNotes(); // Just re-render with our updated notes array
            showNotification('Note deleted successfully!', 'success');
        } catch (error) {
            console.error('Error deleting note:', error);
            showNotification('Failed to delete note: ' + error.message, 'error');
        }
    }
}

function showVault() {
    document.getElementById('viewer').classList.add('hidden');
    document.getElementById('vault').classList.remove('hidden');
}

function hideModal() {
    document.getElementById('note-modal').classList.add('hidden');
    
    // Remove delete button if it exists
    const deleteBtn = document.querySelector('.delete-note-btn');
    if (deleteBtn) {
        deleteBtn.remove();
    }
    
    // Reset save button state
    const saveButton = document.getElementById('save-note');
    delete saveButton.dataset.isNew;
    delete saveButton.dataset.noteId;
    delete saveButton.dataset.notePayload;
}

// Helper function to show notifications
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    const bgColor = type === 'success' ? 'bg-green-100 border-green-500 text-green-700' : 
                    type === 'error' ? 'bg-red-100 border-red-500 text-red-700' : 
                    'bg-blue-100 border-blue-500 text-blue-700';
    
    notification.className = `fixed bottom-4 right-4 ${bgColor} border-l-4 p-4 rounded shadow-lg z-50 transition-all duration-300 transform`;
    notification.innerHTML = `
        <div class="flex items-center">
            <svg class="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                ${type === 'success' ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>' :
                  type === 'error' ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>' :
                  '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>'}
            </svg>
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.opacity = '1';
    }, 10);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// End of file

