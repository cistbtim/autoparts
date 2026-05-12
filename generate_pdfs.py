#!/usr/bin/env python3
"""Generate professional PDFs from markdown quick-start guides."""

import os
import re
from fpdf import FPDF
from pathlib import Path

def remove_emojis(text):
    """Remove emoji characters from text for PDF compatibility."""
    # Remove all special emoji and unicode characters
    emoji_pattern = re.compile(
        "["
        "\U0001F600-\U0001F64F"  # emoticons
        "\U0001F300-\U0001F5FF"  # symbols & pictographs
        "\U0001F680-\U0001F6FF"  # transport & map symbols
        "\U0001F1E0-\U0001F1FF"  # flags (iOS)
        "\u2600-\u27BF"  # Miscellaneous Symbols and Pictographs
        "\u2700-\u27BF"  # Dingbats
        "\u2300-\u23FF"  # Miscellaneous Technical
        "\u2000-\u206F"  # General Punctuation
        "\u2070-\u209F"  # Superscripts and Subscripts
        "\u20A0-\u20CF"  # Currency Symbols
        "\u2100-\u214F"  # Letterlike Symbols
        "]+",
        flags=re.UNICODE
    )
    text = emoji_pattern.sub(r'', text)
    # Also remove any non-latin extended characters that might cause issues
    return ''.join(c if ord(c) < 256 else '' for c in text)

class MarkdownPDF(FPDF):
    def __init__(self, title=""):
        super().__init__()
        self.WIDTH = 210
        self.HEIGHT = 297
        self.title_text = remove_emojis(title)
        
    def header(self):
        # Add header with title
        if self.page_no() > 1:
            self.set_font("Helvetica", "I", 8)
            self.cell(0, 10, self.title_text, 0, 1, "C")
            self.ln(5)
    
    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.cell(0, 10, f"Page {self.page_no()}", 0, 0, "C")
    
    def parse_markdown(self, text):
        """Parse markdown and add formatted content to PDF."""
        lines = text.split('\n')
        i = 0
        
        while i < len(lines):
            line = remove_emojis(lines[i])
            
            # Main heading (h1)
            if line.startswith("# "):
                self.set_font("Helvetica", "B", 16)
                self.set_text_color(25, 45, 85)  # Dark blue
                title = line[2:].strip()
                self.multi_cell(0, 10, title)
                self.ln(3)
                i += 1
                continue
            
            # Heading 2 (h2)
            if line.startswith("## "):
                self.set_font("Helvetica", "B", 12)
                self.set_text_color(40, 70, 120)  # Medium blue
                self.ln(2)
                heading = line[3:].strip()
                self.multi_cell(0, 9, heading)
                self.ln(1)
                i += 1
                continue
            
            # Heading 3 (h3)
            if line.startswith("### "):
                self.set_font("Helvetica", "B", 11)
                self.set_text_color(60, 100, 150)
                self.ln(1)
                heading = line[4:].strip()
                self.multi_cell(0, 8, heading)
                self.ln(0.5)
                i += 1
                continue
            
            # Numbered lists
            if re.match(r'^\d+\. ', line):
                self.set_font("Helvetica", "", 10)
                self.set_text_color(0, 0, 0)
                match = re.match(r'^(\d+)\. (.+)$', line)
                if match:
                    num = match.group(1)
                    text = match.group(2)
                    self.set_x(14)
                    self.cell(3, 7, num + ".", new_x="RIGHT", new_y="TOP")
                    self.multi_cell(0, 7, text)
                i += 1
                continue
            
            # Bullet points
            if line.startswith("- ") or line.startswith("[] "):
                self.set_font("Helvetica", "", 10)
                self.set_text_color(0, 0, 0)
                text = line[2:].strip()
                self.set_x(14)
                self.cell(3, 7, "-", new_x="RIGHT", new_y="TOP")
                self.multi_cell(0, 7, text)
                i += 1
                continue
            
            # Horizontal rule
            if line.strip() == "---":
                self.ln(3)
                self.set_draw_color(180, 180, 180)
                self.line(15, self.get_y(), self.WIDTH - 15, self.get_y())
                self.ln(3)
                i += 1
                continue
            
            # Bold text in line
            if line.strip():
                self.set_font("Helvetica", "", 10)
                self.set_text_color(0, 0, 0)
                
                # Handle inline formatting
                formatted_text = line.strip()
                
                # Skip empty lines
                if formatted_text:
                    self.multi_cell(0, 7, formatted_text)
                    self.ln(0.5)
            else:
                self.ln(1)
            
            i += 1

def generate_pdf(markdown_file, output_file):
    """Generate PDF from markdown file."""
    print(f"  Converting: {markdown_file} → {output_file}")
    
    # Read markdown file
    with open(markdown_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Extract title from first heading
    title_match = re.search(r'^# (.+)$', content, re.MULTILINE)
    title = title_match.group(1) if title_match else "Car Parts App - Quick Start"
    
    # Create PDF
    pdf = MarkdownPDF(title=title)
    pdf.add_page()
    pdf.set_margins(12, 12, 12)  # Smaller margins for better space
    pdf.set_auto_page_break(auto=True, margin=12)
    
    # Parse and add markdown content
    pdf.parse_markdown(content)
    
    # Save PDF
    pdf.output(output_file)
    print(f"    ✓ Created: {output_file}")

def main():
    """Generate all PDFs from docs directory."""
    docs_dir = Path("docs")
    output_dir = docs_dir / "pdfs"
    output_dir.mkdir(exist_ok=True)
    
    print("\n📄 Generating Quick-Start Guide PDFs...\n")
    
    markdown_files = [
        ("QuickStart-Customer", "For Customers"),
        ("QuickStart-Manager", "For Managers"),
        ("QuickStart-Shipper", "For Shippers"),
        ("QuickStart-Stocktaker", "For Stocktakers"),
        ("QuickStart-Workshop", "For Workshop Users"),
    ]
    
    for filename, label in markdown_files:
        md_file = docs_dir / f"{filename}.md"
        pdf_file = output_dir / f"{filename}.pdf"
        
        if md_file.exists():
            print(f"\n{label}")
            generate_pdf(str(md_file), str(pdf_file))
        else:
            print(f"  ✗ Missing: {md_file}")
    
    print(f"\n✅ All PDFs generated successfully!")
    print(f"📁 Location: {output_dir.absolute()}")
    print(f"\nFiles ready to print or distribute to users.\n")

if __name__ == "__main__":
    main()
