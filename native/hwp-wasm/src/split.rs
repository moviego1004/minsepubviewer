//! Splits paragraphs that run over a page boundary into one paragraph per page.
//!
//! Hangul stores where each line sits (PARA_LINE_SEG, vertical position from the top of the page
//! body). When a paragraph continues on the next page, its line positions start again near zero in
//! the middle of the paragraph. hwp-core 0.1.0-rc.10 breaks pages only between paragraphs, so those
//! continued lines were drawn over the top of the previous page. Splitting the paragraph at that
//! line gives hwp-core a paragraph starting at the top of the page, which it treats as a new page.
//!
//! Only plain paragraphs are split: no control characters (tables, pictures, fields, tabs) besides
//! the paragraph end, so line offsets in UTF-16 code units are offsets into the text. Sections with columns are left alone:
//! there the positions start again for each column, not for each page.
use hwp_core::document::bodytext::{
    CharShapeInfo, ColumnDivideType, CtrlHeaderData, ParaTextRun, Paragraph, ParagraphRecord, Section,
};
use hwp_core::HwpDocument;

/// A drop to a line this close to the top (HWPUNIT, 1/7200 inch; 0.5 cm) counts as a new page.
const NEW_PAGE_TOP: i32 = 1417;
/// The paragraph end mark, the one control character a plain paragraph has.
const PARA_BREAK: u8 = 13;

pub fn split_paragraphs_at_page_breaks(document: &mut HwpDocument) -> usize {
    let mut count = 0;
    for section in &mut document.body_text.sections {
        if has_columns(section) {
            continue;
        }
        let mut paragraphs = Vec::with_capacity(section.paragraphs.len());
        for paragraph in section.paragraphs.drain(..) {
            let parts = split_paragraph(paragraph);
            count += parts.len() - 1;
            paragraphs.extend(parts);
        }
        section.paragraphs = paragraphs;
    }
    count
}

fn has_columns(section: &Section) -> bool {
    section.paragraphs.iter().any(|paragraph| {
        paragraph.records.iter().any(|record| {
            matches!(record, ParagraphRecord::CtrlHeader { header, .. }
                if matches!(&header.data, CtrlHeaderData::ColumnDefinition { attribute, .. } if attribute.column_count > 1))
        })
    })
}

fn split_paragraph(paragraph: Paragraph) -> Vec<Paragraph> {
    let Some(cuts) = page_cuts(&paragraph) else {
        return vec![paragraph];
    };
    let mut parts = Vec::with_capacity(cuts.len() + 1);
    let mut rest = paragraph;
    // Cut from the end so earlier offsets stay valid.
    for (line, offset) in cuts.into_iter().rev() {
        let (head, tail) = cut(rest, line, offset);
        parts.push(tail);
        rest = head;
    }
    parts.push(rest);
    parts.reverse();
    parts
}

/// (line index, text offset) of each line that starts a new page, when the paragraph is plain.
fn page_cuts(paragraph: &Paragraph) -> Option<Vec<(usize, usize)>> {
    let mut text_len = None;
    let mut segments = None;
    for record in &paragraph.records {
        match record {
            ParagraphRecord::ParaText { text, control_char_positions, inline_control_params, .. } => {
                if control_char_positions.iter().any(|control| control.code != PARA_BREAK) || !inline_control_params.is_empty() {
                    return None;
                }
                text_len = Some(text.encode_utf16().count());
            }
            ParagraphRecord::ParaLineSeg { segments: list } => segments = Some(list),
            ParagraphRecord::ParaCharShape { .. } | ParagraphRecord::ParaRangeTag { .. } => {}
            _ => return None,
        }
    }
    let (text_len, segments) = (text_len?, segments?);
    let cuts: Vec<(usize, usize)> = (1..segments.len())
        .filter(|&i| {
            segments[i].vertical_position < segments[i - 1].vertical_position
                && segments[i].vertical_position < NEW_PAGE_TOP
        })
        .map(|i| (i, segments[i].text_start_position as usize))
        .collect();
    let increasing = cuts.windows(2).all(|pair| pair[0].1 < pair[1].1);
    let inside = cuts.iter().all(|&(_, offset)| offset > 0 && offset < text_len);
    (!cuts.is_empty() && increasing && inside).then_some(cuts)
}

/// Splits before line `line`, whose text starts at UTF-16 offset `offset`.
fn cut(mut paragraph: Paragraph, line: usize, offset: usize) -> (Paragraph, Paragraph) {
    let mut tail = Paragraph {
        para_header: paragraph.para_header.clone(),
        records: Vec::with_capacity(paragraph.records.len()),
    };
    // The continuation is no explicit page or column break of its own.
    tail.para_header.column_divide_type.retain(|kind| *kind == ColumnDivideType::MultiColumn);
    let total = paragraph.para_header.text_char_count as usize;
    paragraph.para_header.text_char_count = offset as u32;
    tail.para_header.text_char_count = total.saturating_sub(offset) as u32;

    for record in &mut paragraph.records {
        let tail_record = match record {
            ParagraphRecord::ParaText { text, runs, control_char_positions, .. } => {
                let units: Vec<u16> = text.encode_utf16().collect();
                let tail_text = String::from_utf16_lossy(&units[offset..]);
                *text = String::from_utf16_lossy(&units[..offset]);
                // Both parts end with the paragraph end mark; the runs are rebuilt from the text.
                let mut tail_controls = control_char_positions.clone();
                for control in &mut tail_controls {
                    control.position = control.position.saturating_sub(offset);
                }
                for control in control_char_positions.iter_mut() {
                    control.position = offset;
                }
                *runs = vec![ParaTextRun::Text { text: text.clone() }];
                ParagraphRecord::ParaText {
                    runs: vec![ParaTextRun::Text { text: tail_text.clone() }],
                    text: tail_text,
                    control_char_positions: tail_controls,
                    inline_control_params: Vec::new(),
                }
            }
            ParagraphRecord::ParaCharShape { shapes } => {
                let offset = offset as u32;
                let active = shapes.iter().filter(|shape| shape.position <= offset).last().map(|shape| shape.shape_id);
                let mut tail_shapes: Vec<CharShapeInfo> = shapes
                    .iter()
                    .filter(|shape| shape.position > offset)
                    .map(|shape| CharShapeInfo { position: shape.position - offset, shape_id: shape.shape_id })
                    .collect();
                let start = shapes.iter().find(|shape| shape.position == offset).map(|shape| shape.shape_id).or(active);
                if let Some(shape_id) = start {
                    tail_shapes.insert(0, CharShapeInfo { position: 0, shape_id });
                }
                shapes.retain(|shape| shape.position < offset);
                ParagraphRecord::ParaCharShape { shapes: tail_shapes }
            }
            ParagraphRecord::ParaLineSeg { segments } => {
                let mut tail_segments = segments.split_off(line);
                for segment in &mut tail_segments {
                    segment.text_start_position -= offset as u32;
                }
                ParagraphRecord::ParaLineSeg { segments: tail_segments }
            }
            ParagraphRecord::ParaRangeTag { tags } => {
                let offset = offset as u32;
                let mut tail_tags = Vec::new();
                for tag in tags.iter() {
                    if tag.end > offset {
                        let mut moved = tag.clone();
                        moved.start = tag.start.saturating_sub(offset);
                        moved.end = tag.end - offset;
                        tail_tags.push(moved);
                    }
                }
                tags.retain(|tag| tag.start < offset);
                for tag in tags.iter_mut() {
                    tag.end = tag.end.min(offset);
                }
                ParagraphRecord::ParaRangeTag { tags: tail_tags }
            }
            other => other.clone(),
        };
        tail.records.push(tail_record);
    }
    fix_counts(&mut paragraph);
    fix_counts(&mut tail);
    (paragraph, tail)
}

fn fix_counts(paragraph: &mut Paragraph) {
    for record in &paragraph.records {
        match record {
            ParagraphRecord::ParaCharShape { shapes } => paragraph.para_header.char_shape_count = shapes.len() as u16,
            ParagraphRecord::ParaLineSeg { segments } => paragraph.para_header.line_align_count = segments.len() as u16,
            ParagraphRecord::ParaRangeTag { tags } => paragraph.para_header.range_tag_count = tags.len() as u16,
            _ => {}
        }
    }
}
