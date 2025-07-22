let cy;
let graphData = [];
let allEdges = [];
let allNodes = [];
let categories = [];
let categoryColors = {};

// Initialize the graph
async function initGraph() {
    try {
        const response = await fetch('ai-knowledge-graph.json');
        graphData = await response.json();
        
        const elements = createCytoscapeElements(graphData);
        allEdges = elements.edges;
        allNodes = elements.nodes;
        
        // Extract unique categories and create color mapping
        categories = [...new Set(graphData.map(item => item.category || 'General').filter(cat => cat))];
        categoryColors = createCategoryColors(categories);
        
        // Create category filter UI
        createCategoryFilters(categories);
        
        cy = cytoscape({
            container: document.getElementById('cy'),
            elements: elements,
            style: [
                {
                    selector: 'node',
                    style: {
                        'shape': 'roundrectangle',
                        'background-color': 'data(categoryColor)',
                        'label': 'data(label)',
                        'text-valign': 'center',
                        'text-halign': 'center',
                        'color': '#fff',
                        'font-size': '11px',
                        'font-weight': 'bold',
                        'text-wrap': 'wrap',
                        'text-max-width': '140px',
                        'width': 'mapData(labelLength, 10, 50, 80, 160)',
                        'height': 'mapData(labelLength, 10, 50, 40, 80)',
                        'border-width': 2,
                        'border-color': 'data(categoryBorderColor)',
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
                randomize: false,
                componentSpacing: 100,
                nodeRepulsion: 400000,
                edgeElasticity: 100,
                nestingFactor: 5,
                gravity: 80,
                numIter: 1000,
                initialTemp: 200,
                coolingFactor: 0.95,
                minTemp: 1.0
            },
            wheelSensitivity: 0.2
        });

        setupEventListeners();
        setupEdgeFilters();
        setupCategoryFilters();
        
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
            categoryColor: categoryColor ? categoryColor.background : '#95a5a6',
            categoryBorderColor: categoryColor ? categoryColor.border : '#7f8c8d',
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
                    const defaultColor = categoryColors[defaultCategory] || { background: '#95a5a6', border: '#7f8c8d' };
                    
                    const targetNodeData = {
                        id: targetId,
                        label: targetId,
                        definition: '',
                        explanation: '',
                        category: defaultCategory,
                        categoryColor: defaultColor.background,
                        categoryBorderColor: defaultColor.border,
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
        
        showSidebar(data);
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
        
        const colorIndicator = document.createElement('span');
        colorIndicator.className = 'category-color';
        colorIndicator.style.backgroundColor = categoryColors[category].background;
        
        label.appendChild(checkbox);
        label.appendChild(colorIndicator);
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
        minTemp: 1.0
    }).run();
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initGraph);