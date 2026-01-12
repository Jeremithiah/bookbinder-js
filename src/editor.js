/**
 * Visual Page Editor for Bookbinder
 * Allows users to visually rearrange, add, and delete PDF pages before imposition
 */
import pdfjsLib from './utils/pdfjs-config.js';
import Sortable from 'sortablejs';

export class PageEditor {
    constructor() {
        this.pages = []; // Array of { type: 'source'|'text', index?: number, content?: string, id: string }
        this.pdfDocument = null;
        this.currentView = 'grid'; // 'grid' or 'spread'
        this.initialized = false;
        this.renderQueue = new Map(); // Track pages being rendered
        this.observer = null; // IntersectionObserver for lazy loading
        this.sortable = null; // SortableJS instance
        this.containerEl = null;
        this.sectionEl = null;
    }

    /**
     * Initialize the editor with a PDF file
     * @param {File} file - PDF file from user upload
     */
    async init(file) {
        try {
            // Load PDF with pdfjs-dist
            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            this.pdfDocument = await loadingTask.promise;

            // Initialize pages array from source PDF (0-indexed for pdf-lib compatibility)
            this.pages = [];
            for (let i = 0; i < this.pdfDocument.numPages; i++) {
                this.pages.push({
                    type: 'source',
                    index: i, // 0-based index for pdf-lib
                    id: `source-${i}-${Date.now()}`
                });
            }

            this.initialized = true;
            this.show();
            this.render();

            return true;
        } catch (error) {
            console.error('Error initializing page editor:', error);
            alert('Failed to load PDF for editing. Please try again.');
            return false;
        }
    }

    /**
     * Show the editor section
     */
    show() {
        this.sectionEl = document.getElementById('page-editor');
        if (this.sectionEl) {
            this.sectionEl.style.display = 'block';
            this.setupEventListeners();
        }
    }

    /**
     * Hide the editor section
     */
    hide() {
        if (this.sectionEl) {
            this.sectionEl.style.display = 'none';
        }
    }

    /**
     * Reset editor to initial state
     */
    reset() {
        if (this.pdfDocument && this.initialized) {
            this.pages = [];
            for (let i = 0; i < this.pdfDocument.numPages; i++) {
                this.pages.push({
                    type: 'source',
                    index: i,
                    id: `source-${i}-${Date.now()}`
                });
            }
            this.render();
        }
    }

    /**
     * Setup event listeners for UI controls
     */
    setupEventListeners() {
        // Add text page button
        const addTextBtn = document.getElementById('editor-add-text-page');
        if (addTextBtn) {
            addTextBtn.addEventListener('click', () => this.addTextPage());
        }

        // View toggle (grid/spread)
        const viewRadios = document.querySelectorAll('input[name="editor-view"]');
        viewRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.currentView = e.target.value;
                this.render();
            });
        });

        // Reset button
        const resetBtn = document.getElementById('editor-reset');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                if (confirm('Reset to original page order? This will remove all custom text pages.')) {
                    this.reset();
                }
            });
        }
    }

    /**
     * Render the page grid/spread
     */
    render() {
        this.containerEl = document.getElementById('page-grid');
        if (!this.containerEl || !this.initialized) return;

        // Clear existing content
        this.containerEl.innerHTML = '';

        // Update view class
        this.containerEl.className = this.currentView === 'spread' ? 'editor-spread-view' : 'editor-grid-view';

        // Render based on view type
        if (this.currentView === 'spread') {
            this.renderSpreadView();
        } else {
            this.renderGridView();
        }

        // Initialize drag-and-drop
        this.initSortable();

        // Setup lazy loading for performance (if more than 20 pages)
        if (this.pages.length > 20) {
            this.setupLazyLoading();
        } else {
            // Render all pages immediately for small PDFs
            this.renderAllPages();
        }

        // Update stats
        this.updateStats();
    }

    /**
     * Render grid view (all pages)
     */
    renderGridView() {
        this.pages.forEach((page, idx) => {
            const pageEl = this.createPageElement(page, idx);
            this.containerEl.appendChild(pageEl);
        });
    }

    /**
     * Render spread view (opposing pages)
     * Page 1 is distinct (right side), then pairs: 2-3, 4-5, etc.
     */
    renderSpreadView() {
        // First page (always on right)
        if (this.pages.length > 0) {
            const spreadEl = document.createElement('div');
            spreadEl.className = 'spread-container';

            const leftPlaceholder = document.createElement('div');
            leftPlaceholder.className = 'page-placeholder';
            leftPlaceholder.textContent = 'Cover (outside)';

            const page1 = this.createPageElement(this.pages[0], 0);
            page1.classList.add('spread-right');

            spreadEl.appendChild(leftPlaceholder);
            spreadEl.appendChild(page1);
            this.containerEl.appendChild(spreadEl);
        }

        // Remaining pages in pairs (2-3, 4-5, etc.)
        for (let i = 1; i < this.pages.length; i += 2) {
            const spreadEl = document.createElement('div');
            spreadEl.className = 'spread-container';

            // Left page (even)
            const leftPage = this.createPageElement(this.pages[i], i);
            leftPage.classList.add('spread-left');
            spreadEl.appendChild(leftPage);

            // Right page (odd) if it exists
            if (i + 1 < this.pages.length) {
                const rightPage = this.createPageElement(this.pages[i + 1], i + 1);
                rightPage.classList.add('spread-right');
                spreadEl.appendChild(rightPage);
            } else {
                // Placeholder for missing right page
                const placeholder = document.createElement('div');
                placeholder.className = 'page-placeholder';
                placeholder.textContent = 'Empty';
                spreadEl.appendChild(placeholder);
            }

            this.containerEl.appendChild(spreadEl);
        }
    }

    /**
     * Create a page element (thumbnail container)
     * @param {Object} page - Page data
     * @param {number} idx - Index in pages array
     */
    createPageElement(page, idx) {
        const pageEl = document.createElement('div');
        pageEl.className = 'page-item';
        pageEl.dataset.pageId = page.id;
        pageEl.dataset.pageIndex = idx;

        // Page number label
        const label = document.createElement('div');
        label.className = 'page-label';
        label.textContent = page.type === 'source'
            ? `Page ${idx + 1} (PDF p.${page.index + 1})`
            : `Page ${idx + 1} (Text)`;
        pageEl.appendChild(label);

        // Canvas for rendering
        const canvas = document.createElement('canvas');
        canvas.className = 'page-canvas';
        canvas.dataset.rendered = 'false';
        pageEl.appendChild(canvas);

        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'page-delete-btn';
        deleteBtn.textContent = '×';
        deleteBtn.title = 'Delete page';
        deleteBtn.type = 'button';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deletePage(idx);
        });
        pageEl.appendChild(deleteBtn);

        // Edit button for text pages
        if (page.type === 'text') {
            const editBtn = document.createElement('button');
            editBtn.className = 'page-edit-btn';
            editBtn.textContent = '✎';
            editBtn.title = 'Edit text';
            editBtn.type = 'button';
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.editTextPage(idx);
            });
            pageEl.appendChild(editBtn);
        }

        return pageEl;
    }

    /**
     * Render all pages immediately (for small PDFs)
     */
    renderAllPages() {
        const canvases = this.containerEl.querySelectorAll('.page-canvas[data-rendered="false"]');
        canvases.forEach(canvas => {
            const pageEl = canvas.closest('.page-item');
            const idx = parseInt(pageEl.dataset.pageIndex);
            this.renderPage(this.pages[idx], canvas);
        });
    }

    /**
     * Setup lazy loading with IntersectionObserver (for large PDFs)
     */
    setupLazyLoading() {
        // Disconnect existing observer
        if (this.observer) {
            this.observer.disconnect();
        }

        // Create new observer
        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const canvas = entry.target;
                    if (canvas.dataset.rendered === 'false') {
                        const pageEl = canvas.closest('.page-item');
                        const idx = parseInt(pageEl.dataset.pageIndex);
                        this.renderPage(this.pages[idx], canvas);
                        this.observer.unobserve(canvas); // Stop observing once rendered
                    }
                }
            });
        }, {
            root: null,
            rootMargin: '50px', // Start loading 50px before visible
            threshold: 0.01
        });

        // Observe all canvases
        const canvases = this.containerEl.querySelectorAll('.page-canvas');
        canvases.forEach(canvas => this.observer.observe(canvas));
    }

    /**
     * Render a single page to canvas
     * @param {Object} page - Page data
     * @param {HTMLCanvasElement} canvas - Target canvas
     */
    async renderPage(page, canvas) {
        // Prevent duplicate renders
        if (canvas.dataset.rendered === 'true' || this.renderQueue.has(canvas)) {
            return;
        }

        this.renderQueue.set(canvas, true);

        try {
            if (page.type === 'source') {
                // Render PDF page using pdfjs-dist (1-based indexing for getPage)
                const pdfPage = await this.pdfDocument.getPage(page.index + 1);

                // Calculate scale to fit thumbnail
                const viewport = pdfPage.getViewport({ scale: 1 });
                const scale = Math.min(150 / viewport.width, 200 / viewport.height);
                const scaledViewport = pdfPage.getViewport({ scale });

                // Set canvas dimensions
                canvas.width = scaledViewport.width;
                canvas.height = scaledViewport.height;

                // Render
                const renderContext = {
                    canvasContext: canvas.getContext('2d'),
                    viewport: scaledViewport
                };
                await pdfPage.render(renderContext).promise;
            } else {
                // Render text page
                this.renderTextPage(page, canvas);
            }

            canvas.dataset.rendered = 'true';
        } catch (error) {
            console.error('Error rendering page:', error);
            // Show error on canvas
            const ctx = canvas.getContext('2d');
            canvas.width = 150;
            canvas.height = 200;
            ctx.fillStyle = '#f0f0f0';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#ff0000';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Error rendering', canvas.width / 2, canvas.height / 2);
        } finally {
            this.renderQueue.delete(canvas);
        }
    }

    /**
     * Render a text page to canvas
     * @param {Object} page - Text page data
     * @param {HTMLCanvasElement} canvas - Target canvas
     */
    renderTextPage(page, canvas) {
        canvas.width = 150;
        canvas.height = 200;

        const ctx = canvas.getContext('2d');

        // Background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Border
        ctx.strokeStyle = '#cccccc';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);

        // Text label
        ctx.fillStyle = '#666666';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Custom Text Page', canvas.width / 2, 30);

        // Content preview
        if (page.content) {
            ctx.font = '10px monospace';
            ctx.fillStyle = '#000000';
            const lines = page.content.split('\n').slice(0, 15); // Show first 15 lines
            lines.forEach((line, i) => {
                const truncated = line.length > 20 ? `${line.substring(0, 20)  }...` : line;
                ctx.fillText(truncated, canvas.width / 2, 50 + i * 12);
            });
        } else {
            ctx.fillStyle = '#999999';
            ctx.font = '12px sans-serif';
            ctx.fillText('(empty)', canvas.width / 2, canvas.height / 2);
        }
    }

    /**
     * Initialize SortableJS for drag-and-drop
     */
    initSortable() {
        // Destroy existing sortable
        if (this.sortable) {
            this.sortable.destroy();
        }

        // Create new sortable instance
        this.sortable = Sortable.create(this.containerEl, {
            animation: 150,
            ghostClass: 'page-ghost',
            dragClass: 'page-drag',
            handle: '.page-item', // Entire page is draggable
            onEnd: (evt) => {
                // Update pages array after drop
                const movedPage = this.pages.splice(evt.oldIndex, 1)[0];
                this.pages.splice(evt.newIndex, 0, movedPage);

                // Re-render to update labels
                this.render();
            }
        });
    }

    /**
     * Add a new text page
     */
    addTextPage() {
        const content = prompt('Enter text for the new page:\n(You can edit this later)');

        if (content !== null) { // User didn't cancel
            const newPage = {
                type: 'text',
                content: content || '',
                id: `text-${Date.now()}`
            };

            this.pages.push(newPage);
            this.render();
        }
    }

    /**
     * Edit a text page
     * @param {number} idx - Index in pages array
     */
    editTextPage(idx) {
        const page = this.pages[idx];
        if (page.type !== 'text') return;

        const newContent = prompt('Edit text page content:', page.content);

        if (newContent !== null) { // User didn't cancel
            page.content = newContent;

            // Re-render just this page
            const pageEl = this.containerEl.querySelector(`[data-page-index="${idx}"]`);
            if (pageEl) {
                const canvas = pageEl.querySelector('.page-canvas');
                canvas.dataset.rendered = 'false';
                this.renderTextPage(page, canvas);
                canvas.dataset.rendered = 'true';
            }
        }
    }

    /**
     * Delete a page
     * @param {number} idx - Index in pages array
     */
    deletePage(idx) {
        if (confirm(`Delete page ${idx + 1}?`)) {
            this.pages.splice(idx, 1);
            this.render();
        }
    }

    /**
     * Update statistics display
     */
    updateStats() {
        const statsEl = document.getElementById('editor-page-count');
        if (statsEl) {
            const sourceCount = this.pages.filter(p => p.type === 'source').length;
            const textCount = this.pages.filter(p => p.type === 'text').length;

            let text = `${this.pages.length} pages`;
            if (textCount > 0) {
                text += ` (${sourceCount} PDF + ${textCount} text)`;
            }

            statsEl.textContent = text;
        }
    }

    /**
     * Get the custom page order to pass to Book class
     * @returns {Array} Custom page order array
     */
    getCustomPageOrder() {
        // Return a copy to prevent external modifications
        return this.pages.map(page => ({ ...page }));
    }

    /**
     * Check if editor has been modified
     * @returns {boolean} True if pages have been reordered or modified
     */
    isModified() {
        if (!this.initialized || !this.pdfDocument) return false;

        // Check if page count changed
        if (this.pages.length !== this.pdfDocument.numPages) return true;

        // Check if order changed or any text pages added
        for (let i = 0; i < this.pages.length; i++) {
            const page = this.pages[i];
            if (page.type === 'text') return true;
            if (page.type === 'source' && page.index !== i) return true;
        }

        return false;
    }

    /**
     * Cleanup resources
     */
    destroy() {
        if (this.observer) {
            this.observer.disconnect();
        }
        if (this.sortable) {
            this.sortable.destroy();
        }
        this.pages = [];
        this.pdfDocument = null;
        this.initialized = false;
    }
}
