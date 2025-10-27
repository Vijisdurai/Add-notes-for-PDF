const API_BASE = window.location.origin;

let currentDocId = null;
let currentPage = 1;
let totalPages = 1;
let pdfDocument = null;
let notes = [];

let notesVisible = true; // Default state is visible
let addNotesMode = false; // Default: can't add notes by clicking

document.addEventListener('DOMContentLoaded', () => {
    // Initialize UI
    loadDocuments();
    initializePageControls();

    // Add event listeners
    document.getElementById('search-btn').addEventListener('click', searchDocuments);
    document.getElementById('upload').addEventListener('change', uploadPDF);
    document.getElementById('back-to-vault').addEventListener('click', showVault);
    document.getElementById('save-note').addEventListener('click', saveNote);
    document.getElementById('cancel-note').addEventListener('click', hideModal);
    document.getElementById('close-modal').addEventListener('click', hideModal);
    
    // Add toggle for Add Notes Mode
    document.getElementById('toggle-add-mode').addEventListener('change', (e) => {
        addNotesMode = e.target.checked;
        const clickLayer = document.getElementById('click-layer');
        
        if (addNotesMode) {
            clickLayer.style.cursor = 'crosshair';
            clickLayer.style.pointerEvents = 'auto';
            console.log('✏️ Add Notes Mode: ENABLED - Click anywhere to add notes');
            
            // Show a notification
            showNotification('Add Notes Mode enabled. Click anywhere on the PDF to add a note.', 'success');
        } else {
            clickLayer.style.cursor = 'default';
            clickLayer.style.pointerEvents = 'none';
            console.log('🔒 Add Notes Mode: DISABLED - Click layer is off');
            
            // Show a notification
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
                </div>
            `;
            
            card.addEventListener('click', () => {
                console.log('Document clicked:', doc.doc_id, doc.filename);
                loadPDF(doc.doc_id);
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
                loadPDF(doc.doc_id);
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

async function uploadPDF(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.name.toLowerCase().endsWith('.pdf')) {
        alert('Only PDF files are allowed!');
        return;
    }
    
    try {
        // Show loading state
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
            throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        
        // Show success notification
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
        
        // Remove notification after 3 seconds
        setTimeout(() => {
            notification.classList.add('opacity-0');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
        
        // Reload document list
        loadDocuments();
    } catch (error) {
        console.error('Error uploading PDF:', error);
        alert('Upload failed: ' + error.message);
        loadDocuments(); // Reload documents list
    } finally {
        // Reset file input
        event.target.value = '';
    }
}

async function loadPDF(docId) {
    try {
        // Show loading indicator
        document.getElementById('pdf-loading').classList.remove('hidden');
        
        console.log('Loading PDF for document ID:', docId);
        currentDocId = docId;
        currentPage = 1; // Reset to first page
        document.getElementById('vault').classList.add('hidden');
        document.getElementById('viewer').classList.remove('hidden');
        console.log('Switched to viewer');

        // Get document details
        const response = await fetch(`${API_BASE}/documents`);
        const documents = await response.json();
        console.log('Documents:', documents);
        
        const doc = documents.find(d => d.doc_id === docId);
        if (!doc) {
            throw new Error(`Document with ID ${docId} not found`);
        }
        
        console.log('Selected document:', doc);
        document.getElementById('document-title').textContent = doc.filename;

        const url = `${API_BASE}${doc.url}`;
        console.log('PDF URL:', url);
        
        // Load PDF using PDF.js
        const loadingTask = pdfjsLib.getDocument(url);
        pdfDocument = await loadingTask.promise;
        totalPages = pdfDocument.numPages;
        
        // Update page navigation
        document.getElementById('current-page-num').textContent = currentPage;
        document.getElementById('total-pages').textContent = totalPages;
        
        // Setup page navigation
        document.getElementById('prev-page').addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                renderCurrentPage();
            }
        });
        
        document.getElementById('next-page').addEventListener('click', () => {
            if (currentPage < totalPages) {
                currentPage++;
                renderCurrentPage();
            }
        });
        
        // Get the click layer from HTML
        const clickLayer = document.getElementById('click-layer');
        
        // Add click handler to click layer for adding notes
        clickLayer.onclick = (e) => {
            console.log('Click detected on click layer');
            
            // Check if Add Notes Mode is enabled
            if (!addNotesMode) {
                console.log('Add Notes Mode is disabled, ignoring click');
                return;
            }
            
            // Check if notes are visible
            if (!notesVisible) {
                console.log('Notes not visible, ignoring click');
                return;
            }
            
            // Check if we clicked on a note or UI element
            // We need to check the entire event path to see if any element is a note or UI control
            const isClickOnNote = e.composedPath().some(el => {
                if (el.classList) {
                    return el.classList.contains('note-icon') || 
                           el.classList.contains('note-container') || 
                           el.classList.contains('note-tooltip');
                }
                return false;
            });
            
            // Check if we clicked on page controls
            const isClickOnControls = e.composedPath().some(el => {
                if (el.id) {
                    return el.id === 'prev-page' || 
                           el.id === 'next-page' || 
                           el.id === 'page-info';
                }
                return false;
            });
            
            // If clicked on note or controls, don't add a new note
            if (isClickOnNote || isClickOnControls) {
                console.log('Clicked on UI element or note, ignoring for note creation');
                return;
            }
            
            // Calculate relative position for the new note
            const rect = clickLayer.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width;
            const y = (e.clientY - rect.top) / rect.height;
            console.log(`Adding note at position: ${x.toFixed(2)}, ${y.toFixed(2)}`);
            addNote(x, y, currentPage);
        };
        
        // Render first page
        await renderCurrentPage();
        
        // Load notes for current page
        loadNotes();
    } catch (error) {
        console.error('Error loading PDF:', error);
        alert(`Error loading PDF: ${error.message}`);
        showVault(); // Go back to vault view
    } finally {
        // Hide loading indicator
        document.getElementById('pdf-loading').classList.add('hidden');
    }
}

async function renderCurrentPage() {
    try {
        document.getElementById('pdf-loading').classList.remove('hidden');
        document.getElementById('current-page-num').textContent = currentPage;
        
        // Get the page
        const page = await pdfDocument.getPage(currentPage);
        
        // Prepare canvas
        const container = document.getElementById('pdf-container');
        
        // Remove only the canvas, preserve overlay and click layer
        const existingCanvas = container.querySelector('canvas');
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
        
        // Insert canvas as the first child (before overlay and click layer)
        container.insertBefore(canvas, container.firstChild);
        
        console.log('📄 Canvas rendered:', {
            width: canvas.width,
            height: canvas.height,
            containerRect: container.getBoundingClientRect()
        });
        
        // Update overlay and click layer to match canvas size
        const overlay = document.getElementById('note-overlay');
        const clickLayer = document.getElementById('click-layer');
        
        if (overlay) {
            // Overlay matches canvas size exactly
            overlay.style.width = canvas.width + 'px';
            overlay.style.height = canvas.height + 'px';
            
            console.log('📌 Overlay positioned:', {
                width: overlay.style.width,
                height: overlay.style.height,
                canvasSize: `${canvas.width}x${canvas.height}`,
                overlayRect: overlay.getBoundingClientRect(),
                overlayParent: overlay.parentElement.id
            });
        } else {
            console.error('❌ Overlay element not found!');
        }
        
        if (clickLayer) {
            clickLayer.style.width = canvas.width + 'px';
            clickLayer.style.height = canvas.height + 'px';
            // Set pointer events based on current mode
            clickLayer.style.pointerEvents = addNotesMode ? 'auto' : 'none';
            clickLayer.style.cursor = addNotesMode ? 'crosshair' : 'default';
            
            console.log('👆 Click layer positioned:', {
                width: clickLayer.style.width,
                height: clickLayer.style.height,
                pointerEvents: clickLayer.style.pointerEvents,
                addNotesMode: addNotesMode,
                clickLayerRect: clickLayer.getBoundingClientRect()
            });
        } else {
            console.error('❌ Click layer element not found!');
        }
        
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
        const response = await fetch(`${API_BASE}/notes?doc_id=${currentDocId}&page=${currentPage}`);
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
            const x = parseFloat(note.x);
            const y = parseFloat(note.y);
            
            if (isNaN(x) || isNaN(y)) {
                console.error('Invalid note position:', note);
                return;
            }
            
            // Create note container with proper positioning
            const noteContainer = document.createElement('div');
            noteContainer.className = 'absolute note-container';
            noteContainer.style.left = `${x * 100}%`;
            noteContainer.style.top = `${y * 100}%`;
            noteContainer.style.transform = 'translate(-50%, -50%)';
            noteContainer.style.zIndex = '40'; // Ensure proper z-index
            
            // Add data attributes to container for easier hit testing
            noteContainer.dataset.noteId = note.id;
            
            // Create note icon as a button
            const icon = document.createElement('button');
            icon.className = 'w-10 h-10 bg-yellow-400 rounded-full cursor-pointer note-icon flex items-center justify-center shadow-lg hover:bg-yellow-500 transition-all';
            icon.style.border = '3px solid #f59e0b';
            icon.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.3)';
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

async function addNote(x, y, pageNum) {
    // Show modal with empty content for new note
    const textarea = document.getElementById('note-content');
    textarea.value = '';
    document.getElementById('note-modal').classList.remove('hidden');
    
    // Focus on the textarea and place cursor in it
    setTimeout(() => {
        textarea.focus();
    }, 100);
    
    // Update save button to handle new note creation
    const saveButton = document.getElementById('save-note');
    saveButton.dataset.isNew = 'true';
    saveButton.dataset.x = x;
    saveButton.dataset.y = y;
    saveButton.dataset.page = pageNum;
    
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
    
    if (!content) {
        alert('Note content cannot be empty');
        return;
    }
    
    try {
        console.log('Saving note...');
        if (saveButton.dataset.isNew === 'true') {
            // Creating a new note
            const x = parseFloat(saveButton.dataset.x);
            const y = parseFloat(saveButton.dataset.y);
            const page = parseInt(saveButton.dataset.page);
            
            console.log('Creating new note:', { doc_id: currentDocId, page, x, y, content });
            
            const response = await fetch(`${API_BASE}/notes`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    doc_id: currentDocId,
                    page: page,
                    x: x,
                    y: y,
                    content: content
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server error: ${response.status} ${errorText}`);
            }
            
            const note = await response.json();
            console.log('Note created:', note);
            notes.push(note);
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
                    content: content
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server error: ${response.status} ${errorText}`);
            }
            
            console.log('Note updated successfully');
            
            // Update the note in our local array
            note.content = content;
        }
        
        hideModal();
        renderNotes(); // Just re-render with our updated notes array
        alert('Note saved successfully!');
    } catch (error) {
        console.error('Error saving note:', error);
        alert('Failed to save note: ' + error.message);
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
            alert('Note deleted successfully!');
        } catch (error) {
            console.error('Error deleting note:', error);
            alert('Failed to delete note: ' + error.message);
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
    delete saveButton.dataset.x;
    delete saveButton.dataset.y;
    delete saveButton.dataset.page;
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

