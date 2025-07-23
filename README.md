# AI Knowledge Graph

An interactive, spatial knowledge graph for exploring AI terminology and concepts. This project transforms a traditional glossary into a dynamic, visual network where related terms are connected and grouped together, making it easier to understand the relationships between different AI concepts.

## Overview

Unlike traditional glossaries that present terms in alphabetical lists, this knowledge graph leverages spatial relationships to show how AI concepts connect to each other. Terms are displayed as nodes with edges representing different types of relationships (synonyms, related concepts). This spatial approach helps users:

- **Discover related concepts** by exploring connected terms
- **Understand context** through visual clustering and relationships
- **Learn progressively** by following connection paths between familiar and new terms
- **Contribute improvements** through an intuitive editing interface

The project uses a JSON representation that remains both human and machine-readable, making it easy to version control, share, and programmatically process while staying accessible for manual editing.

## Who This Is For

This knowledge graph is designed for anyone looking to understand the landscape of AI. Rather than focusing on companies or products, it explores the fundamental concepts that form the foundation of artificial intelligence. Whether you're a student beginning your AI journey, a professional transitioning into the field, or a curious individual seeking to understand how AI works beneath the surface, this resource provides a structured way to learn, understand, and explore the interconnected concepts that define modern AI.

## Features

### 🌐 **Interactive Visualization**
- **Cytoscape.js-powered** graph with smooth zoom, pan, and navigation
- **Rectangular nodes** with term names and automatic text wrapping
- **Color-coded edges** for different relationship types (synonym, related)
- **Hover tooltips** showing definitions for quick reference
- **Consistent layout** that remains stable across page refreshes

### 🔍 **Advanced Filtering**
- **Edge type filtering** - show/hide specific relationship types
- **Category filtering** - focus on specific areas (Basics, Pre-training, Post-training, AI Engineering)
- **URL persistence** - filters survive page refreshes and can be shared via links
- **Visual filter legends** with color-coded indicators

### ✏️ **Built-in Edit Mode**
- **Toggle between view and edit modes** with a single button
- **Click-to-edit** any node to modify its properties
- **Real-time updates** - see changes instantly in the graph
- **Comprehensive editing**:
  - Term names, definitions, and explanations
  - Category assignment with new category creation
  - Edge management (add, remove, custom relationship types)
- **Visual change indicators** - modified nodes show dashed borders

### 📊 **Change Management & Collaboration**
- **Git patch generation** - export all changes as proper git diffs
- **Comprehensive tracking** - captures modifications across the entire knowledge graph
- **Downloadable patches** with timestamps for easy sharing
- **Change indicators** show when modifications have been made

### 📱 **User Experience**
- **Responsive design** that works on desktop and mobile
- **Detailed sidebar** with full term information and connection lists
- **Keyboard-friendly** navigation and editing
- **Clean, minimal interface** focusing on content over decoration

## Project Status

🚧 **This project is currently in progress** 🚧

We're actively developing new features and refining the knowledge graph. The current version provides a solid foundation for exploring AI terminology, with comprehensive editing capabilities and real-time collaboration features.

## Future Features & Enhancements

- **Research Paper Links**: Add direct links to foundational papers and academic sources for each concept
- **Educational Resources**: Include curated links to articles and tutorials for deeper learning
- **Tag System**: Replace single categories with a flexible multi-tag system for better organization
- **Content Expansion**: Add significantly more terms covering broader AI concepts and domains
- **Emergent Characteristics**: Include nodes for scaling laws, emergent capabilities, and model behaviors
- **AI Engineering**: Expand coverage of production practices, deployment, and system architecture
- **Search Functionality**: Implement full-text search to quickly find terms across the entire graph
- **Built-in Synonyms**: Add support for abbreviations and synonyms within nodes instead of separate entries
- **GitHub Integration**: Enable automatic pull request creation directly from the editing interface
- **Layout Optimization**: Eliminate node overlaps and improve force-directed graph positioning

## Data Source

The initial set of AI terms and definitions comes from [Hamel Husain's](https://github.com/hamelsmu) work on AI education and terminology. We're grateful for this foundational contribution that made this project possible.

## Contributing

We encourage community contributions to improve and expand this knowledge graph! Here's how you can help:

### 🎯 **Easy Contributing via UI**
1. Visit the live site and click "Edit Mode"
2. Make your changes directly in the interface
3. Click "Download Patch" to generate a git diff
4. Submit a Pull Request with the patch file

### 🛠️ **Development Setup**
```bash
# Clone the repository
git clone [repository-url]
cd ai-knowledge-graph

# Serve locally (any simple HTTP server works)
python -m http.server 8000
# or
npx serve

# Open http://localhost:8000
```

### 📝 **Ways to Contribute**
- **Add new terms** with definitions and explanations
- **Improve existing definitions** for clarity and accuracy
- **Create new relationships** between terms
- **Organize terms** into better categories
- **Report bugs** or suggest features
- **Improve documentation**

## License

This project is licensed under **Creative Commons (CC)** - see the [LICENSE](LICENSE) file for details.

We believe knowledge should be freely shared and built upon by the community.

---

*Built with ❤️ using Cytoscape.js, vanilla JavaScript, and a passion for making AI knowledge more accessible.*