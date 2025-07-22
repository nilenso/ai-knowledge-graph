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
                    selector: 'edge[type="mentions"]',
                    style: {
                        'line-color': '#9b59b6',
                        'target-arrow-color': '#9b59b6'
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
                name: 'cose',
                idealEdgeLength: 100,
                nodeOverlap: 20,
                refresh: 20,
                fit: true,
                padding: 30,
                randomize: true,
                componentSpacing: 100,
                nodeRepulsion: 400000,
                edgeElasticity: 100,
                nestingFactor: 5,
                gravity: 80,
                numIter: 1000,
                initialTemp: 200,
                coolingFactor: 0.95,
                minTemp: 1.0,
                animate: false
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
        const nodeId = item.term;
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
        const nodeId = item.term;
        
        if (item.edges) {
            item.edges.forEach(edge => {
                const targetId = edge.target;
                
                // Add target node if it doesn't exist
                if (!nodeMap.has(targetId)) {
                    const defaultCategory = 'General';
                    
                    const targetNodeData = {
                        id: targetId,
                        label: targetId,
                        definition: '',
                        explanation: '',
                        category: defaultCategory,
                        hasDefinition: false,
                        labelLength: targetId.length,
                        fullData: { term: targetId, category: defaultCategory }
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
        
        if (definition) {
            tooltip.innerHTML = `<strong>${node.data('label')}</strong><br>${definition}`;
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
        if (!sidebar.contains(evt.target) && !evt.target.closest('#cy')) {
            sidebar.classList.remove('active');
        }
    });
}

// Show sidebar with node details
function showSidebar(data) {
    const sidebar = document.getElementById('sidebar');
    const termEl = document.getElementById('sidebar-term');
    const contentEl = document.getElementById('sidebar-content');

    termEl.textContent = data.term;
    
    let content = '';
    
    if (data.definition) {
        content += `<div class="sidebar-section">
            <h4>Definition</h4>
            <p>${data.definition}</p>
        </div>`;
    }
    
    if (data.explanation) {
        content += `<div class="sidebar-section">
            <h4>Explanation</h4>
            <p>${data.explanation}</p>
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
            content += `<li><span class="edge-type ${edge.type}">${edge.type}</span> → ${edge.target}</li>`;
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
    const filterMentions = document.getElementById('filter-mentions');

    function updateEdgeFilters() {
        applyFilters();
        updateURL();
    }

    filterAllEdges.addEventListener('change', () => {
        if (filterAllEdges.checked) {
            filterSynonym.checked = true;
            filterRelated.checked = true;
            filterMentions.checked = true;
        }
        updateEdgeFilters();
    });

    [filterSynonym, filterRelated, filterMentions].forEach(filter => {
        filter.addEventListener('change', () => {
            if (!filter.checked) {
                filterAllEdges.checked = false;
            } else if (filterSynonym.checked && filterRelated.checked && filterMentions.checked) {
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
    const filterMentions = document.getElementById('filter-mentions').checked;
    
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
                          (type === 'related' && filterRelated) ||
                          (type === 'mentions' && filterMentions);
        
        const nodesVisible = visibleNodeIds.has(edge.data.source) && 
                            visibleNodeIds.has(edge.data.target);
        
        return typeVisible && nodesVisible;
    });
    
    // Update graph
    cy.remove('*');
    cy.add([...visibleNodes, ...visibleEdges]);
    
    // Re-layout the graph
    cy.layout({
        name: 'cose',
        idealEdgeLength: 100,
        nodeOverlap: 20,
        refresh: 20,
        fit: true,
        padding: 30,
        randomize: false,
        componentSpacing: 100,
        nodeRepulsion: 400000,
        edgeElasticity: 100,
        nestingFactor: 5,
        gravity: 80,
        numIter: 1000,
        initialTemp: 200,
        coolingFactor: 0.95,
        minTemp: 1.0,
        animate: false
    }).run();
}

// Setup edit mode functionality
function setupEditMode() {
    const editToggle = document.getElementById('edit-toggle');
    const changesIndicator = document.getElementById('changes-indicator');
    const downloadBtn = document.getElementById('download-patch');
    
    editToggle.addEventListener('click', () => {
        isEditMode = !isEditMode;
        editToggle.textContent = isEditMode ? 'View Mode' : 'Edit Mode';
        editToggle.classList.toggle('active', isEditMode);
        
        if (!isEditMode) {
            // Hide edit form, show read-only sidebar
            const sidebar = document.getElementById('sidebar');
            const editForm = document.getElementById('sidebar-edit-form');
            const sidebarContent = document.getElementById('sidebar-content');
            
            editForm.classList.add('hidden');
            sidebarContent.classList.remove('hidden');
        }
    });

    // Download patch button
    downloadBtn.addEventListener('click', downloadPatch);
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
    
    // Populate category dropdown
    populateCategoryDropdown();
    document.getElementById('edit-category').value = data.category || '';
    
    // Populate edges
    populateEdgesList(data.edges || []);
    
    termEl.textContent = `Editing: ${data.term}`;
    sidebar.classList.add('active');
    
    setupFormEventListeners();
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

// Populate edges list with current edges
function populateEdgesList(edges) {
    const edgesList = document.getElementById('edges-list');
    edgesList.innerHTML = '';
    
    edges.forEach((edge, index) => {
        addEdgeItem(edge.type, edge.target, index);
    });
    
    if (edges.length === 0) {
        edgesList.innerHTML = '<p style="color: #6c757d; font-style: italic;">No edges defined</p>';
    }
}

// Add a single edge item to the list
function addEdgeItem(type = '', target = '', index = null) {
    const edgesList = document.getElementById('edges-list');
    const edgeItem = document.createElement('div');
    edgeItem.className = 'edge-item';
    
    if (edgesList.querySelector('p')) {
        edgesList.innerHTML = '';
    }
    
    edgeItem.innerHTML = `
        <select name="edge-type-${index || Date.now()}">
            <option value="synonym" ${type === 'synonym' ? 'selected' : ''}>Synonym</option>
            <option value="related" ${type === 'related' ? 'selected' : ''}>Related</option>
            <option value="mentions" ${type === 'mentions' ? 'selected' : ''}>Mentions</option>
            <option value="__custom__" ${!['synonym', 'related', 'mentions'].includes(type) ? 'selected' : ''}>Custom</option>
        </select>
        <input type="text" placeholder="Custom type" class="custom-type ${!['synonym', 'related', 'mentions'].includes(type) ? '' : 'hidden'}" value="${!['synonym', 'related', 'mentions'].includes(type) ? type : ''}">
        <input type="text" name="edge-target-${index || Date.now()}" placeholder="Target term" value="${target}">
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
    
    edgesList.appendChild(edgeItem);
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

// Update node data and graph from form input
function updateNodeFromForm() {
    if (!currentEditingNode) return;
    
    const { data, node } = currentEditingNode;
    
    // Get values directly from form elements instead of FormData
    const newTerm = document.getElementById('edit-term').value;
    const newDefinition = document.getElementById('edit-definition').value;
    const newExplanation = document.getElementById('edit-explanation').value;
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
        
        const target = targetInput.value.trim();
        if (edgeType && target && edgeType !== '__custom__') {
            edges.push({ type: edgeType, target });
        }
    });
    
    // Update data objects
    data.term = newTerm;
    data.definition = newDefinition;
    data.explanation = newExplanation;
    data.category = newCategory || 'General';
    data.edges = edges;
    
    // Mark as modified
    modifiedNodes.add(data.term);
    document.getElementById('changes-indicator').classList.remove('hidden');
    document.getElementById('download-patch').classList.remove('hidden');
    
    // Update graph node
    updateGraphNode(node, data);
    
    // Update graph data
    const graphItem = graphData.find(item => item.term === data.term);
    if (graphItem) {
        Object.assign(graphItem, data);
    }
    
    // Rebuild graph elements to reflect edge changes
    rebuildGraphElements();
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
function rebuildGraphElements() {
    const newElements = createCytoscapeElements(graphData);
    
    // Store current positions
    const positions = {};
    cy.nodes().forEach(node => {
        positions[node.id()] = node.position();
    });
    
    // Update elements
    allNodes = newElements.nodes;
    allEdges = newElements.edges;
    
    // Apply current filters
    applyFilters();
    
    // Restore positions where possible
    cy.nodes().forEach(node => {
        if (positions[node.id()]) {
            node.position(positions[node.id()]);
        }
    });
}

// Generate and download git patch for all changes
function downloadPatch() {
    // Sort data consistently for comparison
    const sortedOriginal = [...originalData].sort((a, b) => a.term.localeCompare(b.term));
    const sortedModified = [...graphData].sort((a, b) => a.term.localeCompare(b.term));
    
    const originalString = JSON.stringify(sortedOriginal, null, 2);
    const modifiedString = JSON.stringify(sortedModified, null, 2);
    
    if (originalString === modifiedString) {
        alert('No changes detected!');
        return;
    }
    
    const patch = generateGitPatch(originalString, modifiedString);
    
    // Download patch file
    const blob = new Blob([patch], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `knowledge-graph-changes-${new Date().toISOString().split('T')[0]}.patch`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Comprehensive git patch generator
function generateGitPatch(original, modified) {
    const originalLines = original.split('\n');
    const modifiedLines = modified.split('\n');
    
    let patch = `diff --git a/ai-knowledge-graph.json b/ai-knowledge-graph.json
index 1234567..abcdef0 100644
--- a/ai-knowledge-graph.json
+++ b/ai-knowledge-graph.json
`;
    
    // Find all different lines
    const differences = [];
    const maxLines = Math.max(originalLines.length, modifiedLines.length);
    
    for (let i = 0; i < maxLines; i++) {
        const origLine = originalLines[i] || '';
        const modLine = modifiedLines[i] || '';
        
        if (origLine !== modLine) {
            differences.push({
                lineNum: i,
                original: origLine,
                modified: modLine
            });
        }
    }
    
    if (differences.length === 0) {
        return patch + ' No differences found\n';
    }
    
    // Group consecutive differences into hunks
    const hunks = [];
    let currentHunk = [];
    
    differences.forEach((diff, index) => {
        if (currentHunk.length === 0 || diff.lineNum <= currentHunk[currentHunk.length - 1].lineNum + 5) {
            currentHunk.push(diff);
        } else {
            hunks.push(currentHunk);
            currentHunk = [diff];
        }
    });
    
    if (currentHunk.length > 0) {
        hunks.push(currentHunk);
    }
    
    // Generate patch for each hunk
    hunks.forEach(hunk => {
        const firstLine = hunk[0].lineNum;
        const lastLine = hunk[hunk.length - 1].lineNum;
        const context = 3;
        
        const startLine = Math.max(0, firstLine - context);
        const endLine = Math.min(originalLines.length - 1, lastLine + context);
        
        const origStart = startLine + 1;
        const origCount = endLine - startLine + 1;
        const modStart = startLine + 1;
        const modCount = endLine - startLine + 1;
        
        patch += `@@ -${origStart},${origCount} +${modStart},${modCount} @@\n`;
        
        // Add lines for this hunk
        for (let i = startLine; i <= endLine; i++) {
            const isDifferent = hunk.some(diff => diff.lineNum === i);
            
            if (isDifferent) {
                const diff = hunk.find(d => d.lineNum === i);
                // Show removed line
                if (diff.original && i < originalLines.length) {
                    patch += `-${diff.original}\n`;
                }
                // Show added line
                if (diff.modified && i < modifiedLines.length) {
                    patch += `+${diff.modified}\n`;
                } else if (!diff.modified && i >= modifiedLines.length) {
                    // Line was deleted
                }
            } else {
                // Context line (unchanged)
                if (originalLines[i] !== undefined) {
                    patch += ` ${originalLines[i]}\n`;
                }
            }
        }
    });
    
    return patch;
}

// URL parameter management for filter persistence
function updateURL() {
    const params = new URLSearchParams();
    
    // Get edge filter states
    const edgeFilters = [];
    if (document.getElementById('filter-synonym').checked) edgeFilters.push('synonym');
    if (document.getElementById('filter-related').checked) edgeFilters.push('related');
    if (document.getElementById('filter-mentions').checked) edgeFilters.push('mentions');
    
    if (edgeFilters.length > 0 && edgeFilters.length < 3) {
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
        document.getElementById('filter-mentions').checked = false;
        
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
    
    // Apply the loaded filters
    applyFilters();
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initGraph);