from flask import Flask, render_template, jsonify
import urllib.request
import xml.etree.ElementTree as ET
from bs4 import BeautifulSoup
import re
from datetime import datetime

app = Flask(__name__)

# Config
FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

def parse_xml_feed(xml_data):
    """
    Parses the Atom XML feed for BigQuery Release Notes.
    Returns a list of dictionaries, where each dict represents an individual update.
    """
    root = ET.fromstring(xml_data)
    ns = {'atom': 'http://www.w3.org/2005/Atom'}
    
    updates = []
    
    # Process each entry in the feed
    for entry in root.findall('atom:entry', ns):
        # Entry title is typically the publication date (e.g., "June 17, 2026")
        date_str = entry.find('atom:title', ns).text if entry.find('atom:title', ns) is not None else "Unknown Date"
        
        # Updated timestamp
        updated_elem = entry.find('atom:updated', ns)
        updated_str = updated_elem.text if updated_elem is not None else ""
        
        # Attempt to format date nicely
        formatted_date = date_str
        try:
            # If updated_str exists, we parse it to format the date
            if updated_str:
                # ISO format: 2026-06-17T00:00:00-07:00 or similar
                # Strip timezone offset for simplicity
                clean_time = re.sub(r'[-+]\d{2}:\d{2}$', '', updated_str)
                dt = datetime.fromisoformat(clean_time)
                formatted_date = dt.strftime("%B %d, %Y")
        except Exception:
            pass

        # Parse content HTML
        content_elem = entry.find('atom:content', ns)
        content_html = content_elem.text if content_elem is not None else ""
        
        if not content_html:
            continue
            
        soup = BeautifulSoup(content_html, 'html.parser')
        
        # Google Cloud release notes typically group multiple updates per day under <h3> tags
        current_type = "Feature"
        current_content_nodes = []
        
        # Go through child elements of the content HTML body
        for node in soup.contents:
            if node.name == 'h3':
                # Save the previous update if we have accumulated content
                if current_content_nodes:
                    update_html = "".join(str(e) for e in current_content_nodes).strip()
                    update_text = BeautifulSoup(update_html, 'html.parser').get_text().strip()
                    # Clean up double newlines
                    update_text = re.sub(r'\n+', ' ', update_text)
                    
                    updates.append({
                        'date': date_str,
                        'formatted_date': formatted_date,
                        'timestamp': updated_str,
                        'type': current_type,
                        'html': update_html,
                        'text': update_text
                    })
                    current_content_nodes = []
                
                # Update current type to the new h3 text
                current_type = node.get_text().strip()
            elif node.name is not None:
                current_content_nodes.append(node)
                
        # Append the final update for this entry
        if current_content_nodes:
            update_html = "".join(str(e) for e in current_content_nodes).strip()
            update_text = BeautifulSoup(update_html, 'html.parser').get_text().strip()
            update_text = re.sub(r'\n+', ' ', update_text)
            
            updates.append({
                'date': date_str,
                'formatted_date': formatted_date,
                'timestamp': updated_str,
                'type': current_type,
                'html': update_html,
                'text': update_text
            })
            
    return updates

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/updates')
def get_updates():
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        req = urllib.request.Request(FEED_URL, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as response:
            xml_data = response.read()
            
        updates = parse_xml_feed(xml_data)
        return jsonify({
            'success': True,
            'updates': updates,
            'count': len(updates)
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
