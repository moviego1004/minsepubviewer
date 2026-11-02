//! Thin wasm32-unknown-unknown wrapper around hwp-core (hwpjs 0.1.0-rc.10).
//! No threads, no shared memory, no WASI: plain C ABI.
mod split;

use hwp_core::HwpParser;
use hwp_core::viewer::html::HtmlOptions;

static mut OUT: Vec<u8> = Vec::new();
static mut OK: u32 = 0;

#[no_mangle]
pub extern "C" fn hwp_alloc(len: usize) -> *mut u8 {
    let mut buf = Vec::<u8>::with_capacity(len);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

#[no_mangle]
pub unsafe extern "C" fn hwp_free(ptr: *mut u8, len: usize) {
    drop(Vec::from_raw_parts(ptr, 0, len));
}

/// Converts HWP bytes to HTML. Returns 1 on success, 0 on error; the HTML or
/// error text is read with hwp_out_ptr/hwp_out_len.
#[no_mangle]
pub unsafe extern "C" fn hwp_to_html(ptr: *const u8, len: usize) -> u32 {
    let data = std::slice::from_raw_parts(ptr, len);
    let result = HwpParser::new().parse(data).map(|mut doc| {
        split::split_paragraphs_at_page_breaks(&mut doc);
        let options = HtmlOptions {
            image_output_dir: None,
            html_output_dir: None,
            include_version: None,
            include_page_info: None,
            css_class_prefix: String::new(),
        };
        doc.to_html(&options)
    });
    let (ok, text) = match result { Ok(h) => (1, h), Err(e) => (0, e.to_string()) };
    OUT = text.into_bytes();
    OK = ok;
    ok
}

#[no_mangle]
pub unsafe extern "C" fn hwp_out_ptr() -> *const u8 { (*std::ptr::addr_of!(OUT)).as_ptr() }
#[no_mangle]
pub unsafe extern "C" fn hwp_out_len() -> usize { (*std::ptr::addr_of!(OUT)).len() }
#[no_mangle]
pub unsafe extern "C" fn hwp_out_clear() { OUT = Vec::new(); }
