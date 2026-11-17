# Remove the template's placeholder text (headings, "Text here", helper note, box labels we fill)
# so it doesn't linger hidden under the new layout. Logos, frames and kept labels are untouched.
import sys, pymupdf as f
DROP={'Innovation Title','Text here','Introduction','Methodology','Results','Innovation','Conclusion',
      'Future Work & References','Access and download your own copy','here','QR','Code','Country Flag','Here'}
d=f.open(sys.argv[1]); pg=d[0]; n=0
for b in pg.get_text('dict')['blocks']:
    for l in b.get('lines',[]):
        for s in l['spans']:
            if s['text'].strip() in DROP:
                pg.add_redact_annot(f.Rect(s['bbox'])); n+=1
pg.apply_redactions(images=f.PDF_REDACT_IMAGE_NONE, graphics=f.PDF_REDACT_LINE_ART_NONE)
d.save(sys.argv[2], garbage=3, deflate=True); print('removed',n,'spans')
