// Layout configuration for the fCoSE graph (superior overlap prevention)
const LAYOUT_CONFIG = {
    name: 'fcose',               // Fast, Constraint-based Spring Embedder
    quality: 'default',         // 'draft', 'default' or 'proof' (higher quality = slower)
    randomize: false,            // Whether to randomize node positions initially
    animate: false,              // Whether to animate the layout
    fit: true,                   // Whether to fit the viewport to the graph
    padding: 20,                 // Padding around the graph
    nodeDimensionsIncludeLabels: false, // Whether labels are included in node dimensions
    uniformNodeDimensions: false, // Whether to use uniform node dimensions
    packComponents: false,        // Whether to pack disconnected components
    step: 'all',                 // Which step to run: 'all', 'transformed', 'enforceBounds', 'cose'
    
    // Node separation and overlap prevention
    nodeSeparation: 7500,          // Separation amount between nodes
    piTol: 0.0001,           // Pi tolerance for overlap removal
    
    // Force values
    nodeRepulsion: 2000000,         // Node repulsion force
    idealEdgeLength: 80,         // Ideal edge length
    edgeElasticity: 2,        // Edge elasticity
    nestingFactor: 0.1,          // Nesting factor for compound nodes
    numIter: 2500,               // Maximum iterations
    
    // Cooling and gravity
    gravity: 0,               // Gravity force
    gravityRange: 3.8,           // Gravity range
    gravityCompound: 1.0,        // Gravity multiplier for compound nodes
    gravityRangeCompound: 1.5,   // Gravity range for compound nodes
    initialEnergyOnIncremental: 0.3 // Initial energy on incremental
};

// fCoSE extension registered in HTML

let cy;
let graphData = [];
let allEdges = [];
let allNodes = [];
let categories = [];
let categoryColors = {};
let isEditMode = false;
let originalData = [];
let modifiedNodes = new Set();
let currentEditingNode = null;
let selectedNode = null;

// Simple hash function for consistent positioning
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
}

// Initialize the graph
async function initGraph() {
    try {
        const response = await fetch('ai-knowledge-graph.json');
        graphData = await response.json();
        
        // Check if we have the new ID-based structure
        const hasIds = graphData.length > 0 && graphData[0].id !== undefined;
        if (!hasIds) {
            console.error('JSON data missing ID fields - please regenerate the knowledge graph');
        }
        
        originalData = JSON.parse(JSON.stringify(graphData)); // Deep copy for change tracking
        
        const elements = createCytoscapeElements(graphData);
        allEdges = elements.edges;
        allNodes = elements.nodes;
        
        // Extract unique categories and create color mapping
        categories = [...new Set(graphData.map(item => item.category || 'General').filter(cat => cat))];
        categoryColors = createCategoryColors(categories);
        
        // Create category filter UI
        createCategoryFilters(categories);
        
        // Set a deterministic random seed for consistent layouts
        Math.random = (function() {
            let seed = 12345; // Fixed seed for consistency
            return function() {
                seed = (seed * 9301 + 49297) % 233280;
                return seed / 233280;
            };
        })();

        cy = cytoscape({
            container: document.getElementById('cy'),
            elements: elements,
            style: [
                {
                    selector: 'node',
                    style: {
                        'shape': 'roundrectangle',
                        'background-color': '#f8f9fa',
                        'label': 'data(label)',
                        'text-valign': 'center',
                        'text-halign': 'center',
                        'color': '#333',
                        'font-size': '11px',
                        'font-weight': 'bold',
                        'text-wrap': 'wrap',
                        'text-max-width': '140px',
                        'width': 'mapData(labelLength, 10, 50, 80, 160)',
                        'height': 'mapData(labelLength, 10, 50, 40, 80)',
                        'border-width': 2,
                        'border-color': '#dee2e6',
                        'padding': '8px'
                    }
                },
                {
                    selector: 'edge',
                    style: {
                        'width': 2,
                        'line-color': '#bdc3c7',
                        'target-arrow-color': '#bdc3c7',
                        'target-arrow-shape': 'triangle',
                        'curve-style': 'bezier'
                    }
                },
                {
                    selector: 'edge[type="synonym"]',
                    style: {
                        'line-color': '#27ae60',
                        'target-arrow-color': '#27ae60'
                    }
                },
                {
                    selector: 'edge[type="related"]',
                    style: {
                        'line-color': '#f39c12',
                        'target-arrow-color': '#f39c12'
                    }
                },
                {
                    selector: 'node:selected',
                    style: {
                        'border-width': 4,
                        'border-color': '#f1c40f'
                    }
                }
            ],
            layout: {
                ...LAYOUT_CONFIG,
                randomize: true  // Override for initial layout to spread nodes
            },
            wheelSensitivity: 0.2
        });

        setupEventListeners();
        setupEdgeFilters();
        setupCategoryFilters();
        setupEditMode();
        
        // Load filter state from URL
        loadFiltersFromURL();
        
    } catch (error) {
        console.error('Error loading graph data:', error);
    }
}

// Create category color mapping
function createCategoryColors(categories) {
    const colors = [
        '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', 
        '#1abc9c', '#34495e', '#e67e22', '#95a5a6', '#f1c40f',
        '#8e44ad', '#16a085', '#27ae60', '#2980b9', '#c0392b'
    ];
    
    const colorMap = {};
    categories.forEach((category, index) => {
        const color = colors[index % colors.length];
        colorMap[category] = {
            background: color,
            border: darkenColor(color, 0.2)
        };
    });
    
    return colorMap;
}

// Darken a hex color
function darkenColor(hex, factor) {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * factor * 100);
    const R = (num >> 16) - amt;
    const G = (num >> 8 & 0x00FF) - amt;
    const B = (num & 0x0000FF) - amt;
    return `#${(0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
        (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
        (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1)}`;
}

// Create cytoscape elements from graph data
function createCytoscapeElements(data) {
    const nodes = [];
    const edges = [];
    const nodeMap = new Map(); // Use Map to store full node data

    // First pass: Create all nodes from CSV data
    data.forEach(item => {
        const nodeId = item.id; // Use the actual ID from the data
        const category = item.category || 'General';
        const categoryColor = categoryColors[category];
        
        const nodeData = {
            id: nodeId,
            label: item.term,
            definition: item.definition || '',
            explanation: item.explanation || '',
            category: category,
            hasDefinition: !!item.definition,
            labelLength: item.term.length,
            fullData: item
        };
        
        nodes.push({ data: nodeData });
        nodeMap.set(nodeId, nodeData);
    });

    // Second pass: Create edges and any missing target nodes
    data.forEach(item => {
        const nodeId = item.id; // Use the actual ID from the data
        
        if (item.edges) {
            item.edges.forEach(edge => {
                const targetId = edge.target;
                
                // Add target node if it doesn't exist
                if (!nodeMap.has(targetId)) {
                    const defaultCategory = 'General';
                    
                    const targetNodeData = {
                        id: targetId,
                        label: targetId, // Will use ID as label since we don't have the term name
                        definition: '',
                        explanation: '',
                        category: defaultCategory,
                        hasDefinition: false,
                        labelLength: targetId.length,
                        fullData: { id: targetId, term: targetId, category: defaultCategory }
                    };
                    
                    nodes.push({ data: targetNodeData });
                    nodeMap.set(targetId, targetNodeData);
                }

                edges.push({
                    data: {
                        id: `${nodeId}-${targetId}-${edge.type}`,
                        source: nodeId,
                        target: targetId,
                        type: edge.type
                    }
                });
            });
        }
    });

    return { nodes, edges };
}

// Setup event listeners
function setupEventListeners() {
    const tooltip = document.getElementById('tooltip');
    const sidebar = document.getElementById('sidebar');
    const closeSidebar = document.getElementById('close-sidebar');

    // Node hover for tooltip
    cy.on('mouseover', 'node', (evt) => {
        const node = evt.target;
        const definition = node.data('definition');
        const synonyms = node.data('fullData') && node.data('fullData').synonyms;
        
        if (definition || synonyms) {
            let tooltipContent = `<strong>${node.data('label')}</strong>`;
            if (synonyms) {
                tooltipContent += `<br><em>Synonyms: ${synonyms}</em>`;
            }
            if (definition) {
                tooltipContent += `<br>${definition}`;
            }
            tooltip.innerHTML = tooltipContent;
            tooltip.style.display = 'block';
        }
    });

    cy.on('mouseout', 'node', () => {
        tooltip.style.display = 'none';
    });

    cy.on('mousemove', (evt) => {
        tooltip.style.left = evt.originalEvent.pageX + 10 + 'px';
        tooltip.style.top = evt.originalEvent.pageY + 10 + 'px';
    });

    // Node click for sidebar
    cy.on('tap', 'node', (evt) => {
        const node = evt.target;
        const data = node.data('fullData');
        
        // Update selected node
        selectedNode = { data, node };
        updateURL();
        
        if (isEditMode) {
            showEditForm(data, node);
        } else {
            showSidebar(data);
        }
    });

    // Close sidebar
    closeSidebar.addEventListener('click', () => {
        sidebar.classList.remove('active');
    });

    // Click outside to close sidebar
    document.addEventListener('click', (evt) => {
        if (!sidebar.contains(evt.target) && 
            !evt.target.closest('#cy') && 
            !evt.target.closest('.mode-controls')) {
            sidebar.classList.remove('active');
        }
    });
}

// Show sidebar with node details
function showSidebar(data) {
    const sidebar = document.getElementById('sidebar');
    const termEl = document.getElementById('sidebar-term');
    const contentEl = document.getElementById('sidebar-content');

    const fieldsToReview = data.fields_to_review || [];
    const termReviewIndicator = fieldsToReview.includes('term') ? ' <span style="color: #e74c3c; font-size: 14px;">⚠</span>' : '';
    termEl.innerHTML = data.term + termReviewIndicator;
    
    let content = '';
    
    // Helper function to add review indicator
    function getReviewIndicator(fieldName) {
        return fieldsToReview.includes(fieldName) ? ' <span style="color: #e74c3c; font-size: 12px;">⚠ For Review</span>' : '';
    }
    
    if (data.definition) {
        content += `<div class="sidebar-section">
            <h4>Short Definition${getReviewIndicator('definition')}</h4>
            <p>${data.definition}</p>
        </div>`;
    }
    
    if (data.synonyms) {
        content += `<div class="sidebar-section">
            <h4>Synonyms${getReviewIndicator('synonyms')}</h4>
            <p>${data.synonyms}</p>
        </div>`;
    }
    
    if (data.acronyms) {
        content += `<div class="sidebar-section">
            <h4>Acronyms${getReviewIndicator('acronyms')}</h4>
            <p>${data.acronyms}</p>
        </div>`;
    }
    
    if (data.explanation) {
        content += `<div class="sidebar-section">
            <h4>Why it matters?${getReviewIndicator('explanation')}</h4>
            <p>${data.explanation}</p>
        </div>`;
    }
    
    if (data.technical_summary) {
        content += `<div class="sidebar-section">
            <h4>Technical Summary${getReviewIndicator('technical_summary')}</h4>
            <p>${data.technical_summary}</p>
        </div>`;
    }
    
    if (data.category) {
        content += `<div class="sidebar-section">
            <h4>Category</h4>
            <p>${data.category}</p>
        </div>`;
    }
    
    if (data.edges && data.edges.length > 0) {
        content += `<div class="sidebar-section">
            <h4>Connections</h4>
            <ul class="connections-list">`;
        
        data.edges.forEach(edge => {
            // Find the target node to get its display name
            const targetNode = cy.getElementById(edge.target);
            const targetLabel = targetNode.length > 0 ? targetNode.data('label') : edge.target;
            content += `<li><span class="edge-type ${edge.type}">${edge.type}</span> → ${targetLabel}</li>`;
        });
        
        content += `</ul></div>`;
    }
    
    contentEl.innerHTML = content;
    sidebar.classList.add('active');
}

// Create category filter UI
function createCategoryFilters(categories) {
    const container = document.getElementById('category-filters');
    
    categories.forEach(category => {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `filter-category-${category.replace(/\s+/g, '-').toLowerCase()}`;
        checkbox.checked = true;
        checkbox.dataset.category = category;
        
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(category));
        
        container.appendChild(label);
    });
}

// Setup edge filter controls
function setupEdgeFilters() {
    const filterAllEdges = document.getElementById('filter-all-edges');
    const filterSynonym = document.getElementById('filter-synonym');
    const filterRelated = document.getElementById('filter-related');

    function updateEdgeFilters() {
        applyFilters();
        updateURL();
    }

    filterAllEdges.addEventListener('change', () => {
        if (filterAllEdges.checked) {
            filterSynonym.checked = true;
            filterRelated.checked = true;
        }
        updateEdgeFilters();
    });

    [filterSynonym, filterRelated].forEach(filter => {
        filter.addEventListener('change', () => {
            if (!filter.checked) {
                filterAllEdges.checked = false;
            } else if (filterSynonym.checked && filterRelated.checked) {
                filterAllEdges.checked = true;
            }
            updateEdgeFilters();
        });
    });
}

// Setup category filter controls
function setupCategoryFilters() {
    const filterAllCategories = document.getElementById('filter-all-categories');
    const categoryCheckboxes = document.querySelectorAll('[data-category]');

    function updateCategoryFilters() {
        applyFilters();
        updateURL();
    }

    filterAllCategories.addEventListener('change', () => {
        categoryCheckboxes.forEach(checkbox => {
            checkbox.checked = filterAllCategories.checked;
        });
        updateCategoryFilters();
    });

    categoryCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            const allChecked = Array.from(categoryCheckboxes).every(cb => cb.checked);
            filterAllCategories.checked = allChecked;
            updateCategoryFilters();
        });
    });
}

// Apply all filters (edges and categories)
function applyFilters() {
    // Get active edge filters
    const filterSynonym = document.getElementById('filter-synonym').checked;
    const filterRelated = document.getElementById('filter-related').checked;
    
    // Get active categories
    const activeCategoriesSet = new Set();
    document.querySelectorAll('[data-category]:checked').forEach(checkbox => {
        activeCategoriesSet.add(checkbox.dataset.category);
    });
    
    // Filter nodes by category
    const visibleNodes = allNodes.filter(node => {
        return activeCategoriesSet.has(node.data.category);
    });
    
    // Filter edges by type and by whether both source and target nodes are visible
    const visibleNodeIds = new Set(visibleNodes.map(node => node.data.id));
    const visibleEdges = allEdges.filter(edge => {
        const type = edge.data.type;
        const typeVisible = (type === 'synonym' && filterSynonym) ||
                          (type === 'related' && filterRelated);
        
        const nodesVisible = visibleNodeIds.has(edge.data.source) && 
                            visibleNodeIds.has(edge.data.target);
        
        return typeVisible && nodesVisible;
    });
    
    // Update graph
    cy.remove('*');
    cy.add([...visibleNodes, ...visibleEdges]);
    
    // Re-layout the graph
    cy.layout(LAYOUT_CONFIG).run();
}

// Setup edit mode functionality
function setupEditMode() {
    const editToggle = document.getElementById('edit-toggle');
    const modeIndicator = document.getElementById('mode-indicator');
    const changesIndicator = document.getElementById('changes-indicator');
    const copyBtn = document.getElementById('copy-json');
    const addNewTermBtn = document.getElementById('add-new-term');
    
    editToggle.addEventListener('click', () => {
        const wasEditMode = isEditMode;
        isEditMode = !isEditMode;
        editToggle.textContent = isEditMode ? 'Switch to View Mode' : 'Switch to Edit Mode';
        modeIndicator.textContent = isEditMode ? 'Edit Mode' : 'View Mode';
        editToggle.classList.toggle('active', isEditMode);
        
        // Show/hide add new term button
        if (isEditMode) {
            addNewTermBtn.classList.remove('hidden');
        } else {
            addNewTermBtn.classList.add('hidden');
        }
        
        if (isEditMode && selectedNode) {
            // Switching to edit mode with a selected node - show edit form
            showEditForm(selectedNode.data, selectedNode.node);
        } else if (!isEditMode && selectedNode) {
            // Switching to view mode - hide edit form, show read-only sidebar
            const sidebar = document.getElementById('sidebar');
            const editForm = document.getElementById('sidebar-edit-form');
            const sidebarContent = document.getElementById('sidebar-content');
            
            editForm.classList.add('hidden');
            sidebarContent.classList.remove('hidden');
            
            // Show the selected node's details in view mode
            showSidebar(selectedNode.data);
        } else if (!isEditMode) {
            // No selected node, just hide edit form
            const sidebar = document.getElementById('sidebar');
            const editForm = document.getElementById('sidebar-edit-form');
            const sidebarContent = document.getElementById('sidebar-content');
            
            editForm.classList.add('hidden');
            sidebarContent.classList.remove('hidden');
        }
    });

    // Copy JSON button
    copyBtn.addEventListener('click', copyJSON);
    
    // Add new term button
    addNewTermBtn.addEventListener('click', showNewTermForm);
}

// Show edit form in sidebar
function showEditForm(data, node) {
    const sidebar = document.getElementById('sidebar');
    const termEl = document.getElementById('sidebar-term');
    const contentEl = document.getElementById('sidebar-content');
    const editForm = document.getElementById('sidebar-edit-form');
    
    currentEditingNode = { data, node };
    
    // Hide read-only content, show edit form
    contentEl.classList.add('hidden');
    editForm.classList.remove('hidden');
    
    // Populate form
    document.getElementById('edit-term').value = data.term || '';
    document.getElementById('edit-definition').value = data.definition || '';
    document.getElementById('edit-explanation').value = data.explanation || '';
    document.getElementById('edit-synonyms').value = data.synonyms || '';
    document.getElementById('edit-acronyms').value = data.acronyms || '';
    document.getElementById('edit-technical-summary').value = data.technical_summary || '';
    
    // Populate category dropdown
    populateCategoryDropdown();
    document.getElementById('edit-category').value = data.category || '';
    
    // Populate review checkboxes and mark fields
    populateReviewCheckboxes(data.fields_to_review || []);
    
    // Populate edges
    populateEdgesList(data.edges || []);
    
    // Show delete button for existing terms
    document.getElementById('delete-term').style.display = 'block';
    
    termEl.textContent = data.term;
    sidebar.classList.add('active');
    
    setupFormEventListeners();
    setupDeleteButton();
}

// Show form for adding a new term
function showNewTermForm() {
    const sidebar = document.getElementById('sidebar');
    const termEl = document.getElementById('sidebar-term');
    const contentEl = document.getElementById('sidebar-content');
    const editForm = document.getElementById('sidebar-edit-form');
    
    // Create empty data for new term
    const newTermData = {
        id: '',
        term: '',
        definition: '',
        explanation: '',
        synonyms: '',
        acronyms: '',
        technical_summary: '',
        category: 'General',
        edges: [],
        fields_to_review: []
    };
    
    currentEditingNode = { data: newTermData, node: null };
    
    // Hide read-only content, show edit form
    contentEl.classList.add('hidden');
    editForm.classList.remove('hidden');
    
    // Clear and populate form with empty values
    document.getElementById('edit-term').value = '';
    document.getElementById('edit-definition').value = '';
    document.getElementById('edit-explanation').value = '';
    document.getElementById('edit-synonyms').value = '';
    document.getElementById('edit-acronyms').value = '';
    document.getElementById('edit-technical-summary').value = '';
    
    // Populate category dropdown
    populateCategoryDropdown();
    document.getElementById('edit-category').value = 'General';
    
    // Clear review checkboxes and field markings
    populateReviewCheckboxes([]);
    
    // Clear edges list
    document.getElementById('edges-list').innerHTML = '<p style="color: #6c757d; font-style: italic;">No edges defined</p>';
    
    termEl.textContent = 'New Term';
    sidebar.classList.add('active');
    
    // Hide delete button for new terms
    document.getElementById('delete-term').style.display = 'none';
    
    // Focus on term input
    document.getElementById('edit-term').focus();
    
    setupFormEventListeners();
}

// Setup delete button functionality
function setupDeleteButton() {
    const deleteBtn = document.getElementById('delete-term');
    
    // Remove existing event listeners to avoid duplicates
    deleteBtn.replaceWith(deleteBtn.cloneNode(true));
    const newDeleteBtn = document.getElementById('delete-term');
    
    newDeleteBtn.addEventListener('click', () => {
        if (currentEditingNode && currentEditingNode.data) {
            const termName = currentEditingNode.data.term;
            const termId = currentEditingNode.data.id;
            
            if (confirm(`Are you sure you want to delete "${termName}"? This action cannot be undone.`)) {
                deleteTerm(termId, termName);
            }
        }
    });
}

// Delete a term from the knowledge graph
function deleteTerm(termId, termName) {
    // Remove from graphData
    const termIndex = graphData.findIndex(item => item.id === termId);
    if (termIndex !== -1) {
        graphData.splice(termIndex, 1);
    }
    
    // Remove all edges that target this term
    graphData.forEach(item => {
        if (item.edges) {
            item.edges = item.edges.filter(edge => edge.target !== termId);
        }
    });
    
    // Mark as modified
    modifiedNodes.add(termName);
    document.getElementById('changes-indicator').classList.remove('hidden');
    
    // Close sidebar
    document.getElementById('sidebar').classList.remove('active');
    
    // Clear selection
    selectedNode = null;
    currentEditingNode = null;
    
    // Rebuild graph
    rebuildGraphElements(true);
    
    // Update URL to remove node parameter
    updateURL();
}

// Populate category dropdown with existing categories plus option for new
function populateCategoryDropdown() {
    const categorySelect = document.getElementById('edit-category');
    categorySelect.innerHTML = '<option value="">Select or type new...</option>';
    
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categorySelect.appendChild(option);
    });
    
    const newOption = document.createElement('option');
    newOption.value = '__new__';
    newOption.textContent = '+ Create New Category';
    categorySelect.appendChild(newOption);
}

// Populate review checkboxes and mark fields for review
function populateReviewCheckboxes(fieldsToReview) {
    const reviewCheckboxes = document.querySelectorAll('.review-checkbox');
    
    reviewCheckboxes.forEach(checkbox => {
        const fieldName = checkbox.dataset.field;
        const isChecked = fieldsToReview.includes(fieldName);
        
        checkbox.checked = isChecked;
        
        // Mark the corresponding field visually
        const fieldElement = document.getElementById(`edit-${fieldName.replace('_', '-')}`);
        if (fieldElement) {
            if (isChecked) {
                fieldElement.classList.add('field-marked-for-review');
            } else {
                fieldElement.classList.remove('field-marked-for-review');
            }
        }
    });
}

// Populate edges list with current edges
function populateEdgesList(edges) {
    const edgesList = document.getElementById('edges-list');
    edgesList.innerHTML = '';
    
    edges.forEach((edge, index) => {
        // Find the target node to get its display name
        const targetNode = cy.getElementById(edge.target);
        const targetLabel = targetNode.length > 0 ? targetNode.data('label') : edge.target;
        addEdgeItem(edge.type, targetLabel, index);
    });
    
    if (edges.length === 0) {
        edgesList.innerHTML = '<p style="color: #6c757d; font-style: italic;">No edges defined</p>';
    }
}

// Add a single edge item to the list
function addEdgeItem(type = 'related', target = '', index = null) {
    const edgesList = document.getElementById('edges-list');
    const edgeItem = document.createElement('div');
    edgeItem.className = 'edge-item';
    
    if (edgesList.querySelector('p')) {
        edgesList.innerHTML = '';
    }
    
    const targetInputId = `edge-target-${index || Date.now()}`;
    
    edgeItem.innerHTML = `
        <select name="edge-type-${index || Date.now()}">
            <option value="synonym" ${type === 'synonym' ? 'selected' : ''}>Synonym</option>
            <option value="related" ${type === 'related' ? 'selected' : ''}>Related</option>
            <option value="__custom__" ${!['synonym', 'related'].includes(type) ? 'selected' : ''}>Custom</option>
        </select>
        <input type="text" placeholder="Custom type" class="custom-type ${!['synonym', 'related'].includes(type) ? '' : 'hidden'}" value="${!['synonym', 'related'].includes(type) ? type : ''}">
        <div class="autocomplete-container">
            <input type="text" name="${targetInputId}" id="${targetInputId}" placeholder="Type to search terms..." value="${target}" autocomplete="off">
            <div class="autocomplete-dropdown hidden"></div>
        </div>
        <button type="button" class="remove-edge">×</button>
    `;
    
    // Handle custom type toggle
    const typeSelect = edgeItem.querySelector('select');
    const customInput = edgeItem.querySelector('.custom-type');
    
    typeSelect.addEventListener('change', () => {
        if (typeSelect.value === '__custom__') {
            customInput.classList.remove('hidden');
            customInput.focus();
        } else {
            customInput.classList.add('hidden');
        }
    });
    
    // Handle remove
    edgeItem.querySelector('.remove-edge').addEventListener('click', () => {
        edgeItem.remove();
        if (edgesList.children.length === 0) {
            edgesList.innerHTML = '<p style="color: #6c757d; font-style: italic;">No edges defined</p>';
        }
        updateNodeFromForm();
    });
    
    // Setup autocomplete for target input
    setupAutocomplete(edgeItem.querySelector(`#${targetInputId}`));
    
    edgesList.appendChild(edgeItem);
}

// Setup autocomplete functionality for target input
function setupAutocomplete(input) {
    const container = input.parentElement;
    const dropdown = container.querySelector('.autocomplete-dropdown');
    let currentFocus = -1;
    
    // Get all available terms for autocomplete
    function getAvailableTerms() {
        return graphData.filter(item => item.term).map(item => ({
            id: item.id,
            term: item.term,
            category: item.category || 'General'
        }));
    }
    
    // Filter terms based on input
    function filterTerms(query) {
        if (!query) return [];
        const lowercaseQuery = query.toLowerCase();
        return getAvailableTerms().filter(item => 
            item.term.toLowerCase().includes(lowercaseQuery)
        ).slice(0, 10); // Limit to 10 results
    }
    
    // Show dropdown with filtered results
    function showDropdown(terms) {
        if (terms.length === 0) {
            dropdown.classList.add('hidden');
            return;
        }
        
        dropdown.innerHTML = '';
        terms.forEach((term, index) => {
            const item = document.createElement('div');
            item.className = 'autocomplete-item';
            item.innerHTML = `
                <span class="term-name">${term.term}</span>
                <span class="term-category">${term.category}</span>
            `;
            item.dataset.termId = term.id;
            item.dataset.termName = term.term;
            item.dataset.index = index;
            
            item.addEventListener('click', () => {
                selectTerm(term.term, term.id);
            });
            
            dropdown.appendChild(item);
        });
        
        dropdown.classList.remove('hidden');
        currentFocus = -1;
    }
    
    // Select a term and close dropdown
    function selectTerm(termName, termId) {
        input.value = termName;
        input.dataset.selectedId = termId;
        dropdown.classList.add('hidden');
        currentFocus = -1;
        updateNodeFromForm();
    }
    
    // Handle keyboard navigation
    function handleKeyNavigation(e) {
        const items = dropdown.querySelectorAll('.autocomplete-item');
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            currentFocus = Math.min(currentFocus + 1, items.length - 1);
            updateActiveItem(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            currentFocus = Math.max(currentFocus - 1, -1);
            updateActiveItem(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (currentFocus >= 0 && items[currentFocus]) {
                const item = items[currentFocus];
                selectTerm(item.dataset.termName, item.dataset.termId);
            }
        } else if (e.key === 'Escape') {
            dropdown.classList.add('hidden');
            currentFocus = -1;
        }
    }
    
    // Update visual focus for keyboard navigation
    function updateActiveItem(items) {
        items.forEach((item, index) => {
            if (index === currentFocus) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }
    
    // Event listeners
    input.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        const filteredTerms = filterTerms(query);
        showDropdown(filteredTerms);
        
        // Clear selected ID if input changes
        delete input.dataset.selectedId;
        // Don't call updateNodeFromForm on every keystroke during autocomplete
        // Only call it when user explicitly selects or finishes typing
    });
    
    input.addEventListener('keydown', handleKeyNavigation);
    
    input.addEventListener('focus', (e) => {
        const query = e.target.value.trim();
        if (query) {
            const filteredTerms = filterTerms(query);
            showDropdown(filteredTerms);
        }
    });
    
    input.addEventListener('blur', (e) => {
        // Call updateNodeFromForm when user finishes editing
        setTimeout(() => updateNodeFromForm(), 100); // Small delay to allow click events to fire first
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            dropdown.classList.add('hidden');
            currentFocus = -1;
        }
    });
}

// Setup form event listeners for real-time updates
function setupFormEventListeners() {
    // Add event listeners to form elements
    const form = document.getElementById('node-edit-form');
    
    // Add listeners to all form elements
    form.querySelectorAll('input, textarea, select').forEach(field => {
        // Remove any existing listeners first
        field.removeEventListener('input', updateNodeFromForm);
        field.removeEventListener('change', updateNodeFromForm);
        
        // Add new listeners
        field.addEventListener('input', updateNodeFromForm);
        field.addEventListener('change', updateNodeFromForm);
    });
    
    // Handle category selection
    const categorySelect = document.getElementById('edit-category');
    categorySelect.removeEventListener('change', handleCategoryChange);
    categorySelect.addEventListener('change', handleCategoryChange);
    
    // Add edge button
    const addEdgeBtn = document.getElementById('add-edge');
    addEdgeBtn.removeEventListener('click', handleAddEdge);
    addEdgeBtn.addEventListener('click', handleAddEdge);
    
    // Review checkboxes
    const reviewCheckboxes = document.querySelectorAll('.review-checkbox');
    reviewCheckboxes.forEach(checkbox => {
        checkbox.removeEventListener('change', handleReviewCheckboxChange);
        checkbox.addEventListener('change', handleReviewCheckboxChange);
    });
}

// Handle category selection changes
function handleCategoryChange(e) {
    const customInput = document.getElementById('edit-category-custom');
    if (e.target.value === '__new__') {
        customInput.classList.remove('hidden');
        customInput.focus();
    } else {
        customInput.classList.add('hidden');
    }
    updateNodeFromForm();
}

// Handle add edge button
function handleAddEdge() {
    addEdgeItem();
    updateNodeFromForm();
}

// Handle review checkbox changes
function handleReviewCheckboxChange(e) {
    const fieldName = e.target.dataset.field;
    const isChecked = e.target.checked;
    
    // Mark the corresponding field visually
    const fieldElement = document.getElementById(`edit-${fieldName.replace('_', '-')}`);
    if (fieldElement) {
        if (isChecked) {
            fieldElement.classList.add('field-marked-for-review');
        } else {
            fieldElement.classList.remove('field-marked-for-review');
        }
    }
    
    // Update the data
    updateNodeFromForm();
}

// Update node data and graph from form input
function updateNodeFromForm() {
    if (!currentEditingNode) return;
    
    const { data, node } = currentEditingNode;
    
    // Get values directly from form elements instead of FormData
    const newTerm = document.getElementById('edit-term').value;
    const newDefinition = document.getElementById('edit-definition').value;
    const newExplanation = document.getElementById('edit-explanation').value;
    const newSynonyms = document.getElementById('edit-synonyms').value;
    const newAcronyms = document.getElementById('edit-acronyms').value;
    const newTechnicalSummary = document.getElementById('edit-technical-summary').value;
    let newCategory = document.getElementById('edit-category').value;
    
    // Handle custom category
    if (newCategory === '__new__') {
        newCategory = document.getElementById('edit-category-custom').value || 'General';
        
        // Add new category to system if not exists
        if (!categories.includes(newCategory)) {
            categories.push(newCategory);
            categoryColors[newCategory] = createCategoryColors([newCategory])[newCategory];
            
            // Update category filters
            document.querySelector('#category-filters').innerHTML = '';
            createCategoryFilters(categories);
            setupCategoryFilters();
        }
    } else if (!newCategory || newCategory === '') {
        // If no category selected, keep the original
        newCategory = data.category || 'General';
    }
    
    // Collect edges
    const edges = [];
    const edgeItems = document.querySelectorAll('.edge-item');
    edgeItems.forEach(item => {
        const typeSelect = item.querySelector('select');
        const customType = item.querySelector('.custom-type');
        const targetInput = item.querySelector('input[name^="edge-target"]');
        
        let edgeType = typeSelect.value;
        if (edgeType === '__custom__' && customType.value.trim()) {
            edgeType = customType.value.trim();
        }
        
        const targetName = targetInput.value.trim();
        if (edgeType && targetName && edgeType !== '__custom__') {
            // Use the selected ID from autocomplete if available
            let targetId = targetInput.dataset.selectedId;
            
            if (!targetId) {
                // If no ID selected from autocomplete, try to find by name
                const targetNode = cy.nodes().filter(n => n.data('label') === targetName);
                if (targetNode.length > 0) {
                    targetId = targetNode.data('id');
                }
                // If no existing node found, skip this edge - don't create new terms automatically
            }
            
            // Only add edge if we found a valid target ID (existing term)
            if (targetId) {
                edges.push({ type: edgeType, target: targetId });
            }
        }
    });
    
    // Collect fields marked for review
    const fieldsToReview = [];
    const reviewCheckboxes = document.querySelectorAll('.review-checkbox:checked');
    reviewCheckboxes.forEach(checkbox => {
        fieldsToReview.push(checkbox.dataset.field);
    });
    
    // Update data objects
    data.term = newTerm;
    data.definition = newDefinition;
    data.explanation = newExplanation;
    data.synonyms = newSynonyms;
    data.acronyms = newAcronyms;
    data.technical_summary = newTechnicalSummary;
    data.category = newCategory || 'General';
    data.edges = edges;
    
    // Set fields_to_review (only include if not empty)
    if (fieldsToReview.length > 0) {
        data.fields_to_review = fieldsToReview;
    } else {
        delete data.fields_to_review; // Remove the field if empty
    }
    
    // For new terms, generate ID if not present
    if (!data.id && newTerm) {
        data.id = newTerm.toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[()]/g, '')
            .replace(/\//g, '_')
            .replace(/-/g, '_')
            .replace(/\./g, '')
            .replace(/,/g, '')
            .replace(/'/g, '')
            .replace(/"/g, '');
    }
    
    // Mark as modified
    modifiedNodes.add(data.term);
    document.getElementById('changes-indicator').classList.remove('hidden');
    
    // Handle new term vs existing term
    if (node) {
        // Existing term - update graph node
        updateGraphNode(node, data);
        
        // Update graph data
        const graphItem = graphData.find(item => item.term === data.term || item.id === data.id);
        if (graphItem) {
            // Check if edges changed before updating
            const edgesChanged = JSON.stringify(graphItem.edges || []) !== JSON.stringify(data.edges || []);
            
            Object.assign(graphItem, data);
            
            // Rebuild and recalculate layout if edges changed
            rebuildGraphElements(edgesChanged);
        }
    } else {
        // New term - add to graph data and rebuild
        if (newTerm && data.id) {
            const existingItem = graphData.find(item => item.id === data.id);
            if (!existingItem) {
                graphData.push(data);
                rebuildGraphElements(true); // Always recalculate for new terms
            }
        }
    }
}

// Update the visual graph node
function updateGraphNode(node, data) {
    node.data({
        label: data.term,
        definition: data.definition,
        explanation: data.explanation,
        category: data.category,
        hasDefinition: !!data.definition,
        fullData: data
    });
    
    // Add visual indicator for modification
    node.addClass('node-modified');
    
    // Force update style
    cy.style().update();
}

// Rebuild graph elements when edges change
function rebuildGraphElements(recalculateLayout = false) {
    const newElements = createCytoscapeElements(graphData);
    
    // Store current positions only if we're not recalculating
    const positions = {};
    if (!recalculateLayout) {
        cy.nodes().forEach(node => {
            positions[node.id()] = node.position();
        });
    }
    
    // Update elements
    allNodes = newElements.nodes;
    allEdges = newElements.edges;
    
    // Apply current filters
    applyFilters();
    
    if (recalculateLayout) {
        // Recalculate layout with new edges
        cy.layout({
            ...LAYOUT_CONFIG,
            animate: true  // Override to animate position changes
        }).run();
    } else {
        // Restore positions where possible
        cy.nodes().forEach(node => {
            if (positions[node.id()]) {
                node.position(positions[node.id()]);
            }
        });
    }
}

// Copy JSON to clipboard
async function copyJSON() {
    try {
        // Create JSON string with current graph data
        const jsonString = JSON.stringify(graphData, null, 2);
        
        // Copy to clipboard
        await navigator.clipboard.writeText(jsonString);
        
        // Show feedback message
        showCopyFeedback();
        
    } catch (err) {
        console.error('Failed to copy to clipboard:', err);
        
        // Fallback: create a text area and select it
        const textArea = document.createElement('textarea');
        textArea.value = JSON.stringify(graphData, null, 2);
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        
        // Show feedback message for fallback too
        showCopyFeedback();
    }
}

// Show copy feedback message
function showCopyFeedback() {
    const feedback = document.getElementById('copy-feedback');
    feedback.classList.remove('hidden');
    
    // Hide after 1 second
    setTimeout(() => {
        feedback.classList.add('hidden');
    }, 1000);
}

// URL parameter management for filter persistence
function updateURL() {
    const params = new URLSearchParams();
    
    // Get edge filter states
    const edgeFilters = [];
    if (document.getElementById('filter-synonym').checked) edgeFilters.push('synonym');
    if (document.getElementById('filter-related').checked) edgeFilters.push('related');
    
    if (edgeFilters.length > 0 && edgeFilters.length < 2) {
        params.set('edges', edgeFilters.join(','));
    }
    
    // Get category filter states
    const categoryFilters = [];
    document.querySelectorAll('[data-category]:checked').forEach(checkbox => {
        categoryFilters.push(checkbox.dataset.category);
    });
    
    if (categoryFilters.length > 0 && categoryFilters.length < categories.length) {
        params.set('categories', categoryFilters.join(','));
    }
    
    // Add selected node to URL
    if (selectedNode) {
        params.set('node', selectedNode.data.id);
    }
    
    // Update URL without page reload
    const newURL = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname;
    window.history.replaceState({}, '', newURL);
}

function loadFiltersFromURL() {
    const params = new URLSearchParams(window.location.search);
    
    // Load edge filters
    const edgeFiltersParam = params.get('edges');
    if (edgeFiltersParam) {
        const activeEdges = edgeFiltersParam.split(',');
        
        // Uncheck all first
        document.getElementById('filter-all-edges').checked = false;
        document.getElementById('filter-synonym').checked = false;
        document.getElementById('filter-related').checked = false;
        
        // Check only the specified ones
        activeEdges.forEach(edge => {
            const checkbox = document.getElementById(`filter-${edge}`);
            if (checkbox) checkbox.checked = true;
        });
    }
    
    // Load category filters
    const categoryFiltersParam = params.get('categories');
    if (categoryFiltersParam) {
        const activeCategories = categoryFiltersParam.split(',');
        
        // Uncheck all categories first
        document.getElementById('filter-all-categories').checked = false;
        document.querySelectorAll('[data-category]').forEach(checkbox => {
            checkbox.checked = false;
        });
        
        // Check only the specified ones
        activeCategories.forEach(category => {
            const checkbox = document.querySelector(`[data-category="${category}"]`);
            if (checkbox) checkbox.checked = true;
        });
    }
    
    // Load selected node
    const nodeParam = params.get('node');
    if (nodeParam) {
        const nodeId = nodeParam;
        // Find and select the node after a brief delay to ensure graph is rendered
        setTimeout(() => {
            const node = cy.nodes().filter(n => n.data('fullData').id === nodeId);
            if (node.length > 0) {
                const nodeData = node.data('fullData');
                selectedNode = { data: nodeData, node: node };
                
                // Select the node visually
                cy.nodes().unselect();
                node.select();
                
                // Show sidebar with node details
                if (isEditMode) {
                    showEditForm(nodeData, node);
                } else {
                    showSidebar(nodeData);
                }
            }
        }, 100);
    }
    
    // Apply the loaded filters
    applyFilters();
}

// fCoSE extension already registered in HTML

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initGraph);