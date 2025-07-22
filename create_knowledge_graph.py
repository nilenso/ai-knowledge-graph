#!/usr/bin/env python3
import csv
import json
import re
from typing import List, Dict, Any

def parse_csv_to_knowledge_graph(csv_file: str) -> List[Dict[str, Any]]:
    """Parse CSV and create knowledge graph JSON structure."""
    
    knowledge_graph = []
    term_map = {}  # Track all terms for relationship building
    
    with open(csv_file, 'r', encoding='utf-8') as file:
        reader = csv.DictReader(file)
        
        for row in reader:
            # Skip rows marked for removal or empty terms
            if row['Target Category'] == 'Remove' or not row['Term'].strip():
                continue
            
            # Extract main term and synonyms
            term_text = row['Term'].strip()
            # Handle multi-line term entries - take the first non-empty line as main term
            lines = [line.strip() for line in term_text.split('\n') if line.strip()]
            main_term = lines[0] if lines else term_text.strip()
            
            # Extract synonyms and related terms from term field
            synonyms = []
            related_terms = []
            
            # Look for "syn:" pattern
            if 'syn:' in term_text:
                syn_match = re.search(r'syn:\s*([^\n]+)', term_text)
                if syn_match:
                    synonyms = [s.strip() for s in syn_match.group(1).split(',')]
            
            # Look for "Rel:" pattern
            if 'Rel:' in term_text:
                rel_match = re.search(r'Rel:\s*([^\n]+)', term_text)
                if rel_match:
                    related_terms = [r.strip() for r in rel_match.group(1).split(',')]
            
            # Create edges list
            edges = []
            for syn in synonyms:
                if syn:
                    edges.append({"type": "synonym", "target": syn})
            
            for rel in related_terms:
                if rel:
                    edges.append({"type": "related", "target": rel})
            
            # Look for related terms mentioned in definitions or explanations
            definition = row['Short Definition'].strip()
            explanation = row['Why It Matters'].strip()
            
            # Create the term entry
            term_entry = {
                "term": main_term,
                "definition": definition,
                "explanation": explanation,
                "category": row['Target Category'].strip() if row['Target Category'].strip() else "General",
                "edges": edges
            }
            
            knowledge_graph.append(term_entry)
            term_map[main_term.lower()] = main_term
            
            # Add synonym entries (minimal)
            for syn in synonyms:
                if syn and syn.lower() not in term_map:
                    knowledge_graph.append({"term": syn})
                    term_map[syn.lower()] = syn
            
            # Add related term entries (minimal)
            for rel in related_terms:
                if rel and rel.lower() not in term_map:
                    knowledge_graph.append({"term": rel})
                    term_map[rel.lower()] = rel
    
    return knowledge_graph

def main():
    """Main function to create knowledge graph."""
    input_file = 'ai-glossary.csv'
    output_file = 'ai-knowledge-graph.json'
    
    try:
        knowledge_graph = parse_csv_to_knowledge_graph(input_file)
        
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(knowledge_graph, f, indent=2, ensure_ascii=False)
        
        print(f"Knowledge graph created successfully!")
        print(f"- Input: {input_file}")
        print(f"- Output: {output_file}")
        print(f"- Total terms: {len(knowledge_graph)}")
        
        # Count terms with full definitions
        full_terms = sum(1 for term in knowledge_graph if 'definition' in term)
        print(f"- Terms with definitions: {full_terms}")
        
        # Count total edges
        total_edges = sum(len(term.get('edges', [])) for term in knowledge_graph)
        print(f"- Total relationships: {total_edges}")
        
    except FileNotFoundError:
        print(f"Error: Could not find {input_file}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()