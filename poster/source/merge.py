import sys
from pypdf import PdfReader, PdfWriter
t=PdfReader(sys.argv[1]).pages[0]; o=PdfReader(sys.argv[2]).pages[0]
t.merge_page(o); w=PdfWriter(); w.add_page(t); w.compress_identical_objects(); w.write(sys.argv[3])
