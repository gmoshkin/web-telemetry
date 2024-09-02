/* TODO:
 * - display module name on the left on each of the lanes
 */
const canvas = document.getElementById("canvas");
canvas.width = 1300;
canvas.height = 600;
const ctx = canvas.getContext("2d");

// setInterval(redraw, 17);

var mode = null;
var lastButton = null;

var mouseDown = 0;
let mousePos = null;
let mouse_x = null;
let mouse_y = null;
let mouse_x_start = null;
let mouse_y_start = null;
var selected = null;

var data = JSON.parse(DATA);
var nanos_per_pixel_log = 10;
var nanos_per_pixel = null;
let pixels_per_nano = null;
let current_scale = null;

var modules_by_name = {};
var modules_by_id = [];
var sections = {};

let start_min = data[0][2];
for (let i = 0; i < data.length; i++) {
    let [module, section, start, duration] = data[i];
    if (modules_by_name[module] === undefined) {
        modules_by_name[module] = modules_by_id.length;
        modules_by_id.push(module);
    }
    if (sections[section] === undefined) sections[section] = Object.keys(sections).length;
    data[i] = {
        module_id: modules_by_name[module],
        section_id: sections[section],
        start: start - start_min,
        duration,
    };
}

let section_keys = Object.keys(sections)
for (let i = 0; i < section_keys.length; i++) sections[i] = section_keys[i];

const Mue = '\xb5';

////////////////////////////////////////////////////////////////////////////////
// input handling

let scroll_x_nanos = data[1].start;

canvas.onmousemove = (event) => {
    update_mouse_position(event);
    redraw();
};
canvas.onmousedown = (event) => {
    update_mouse_position(event)
    mouseDown = event.which;
    mouse_x_start = mouse_x;
    mouse_y_start = mouse_y;
    redraw();
};
canvas.onmouseup = (event) => {
    mouseDown = false;
    redraw();
};

addEventListener("wheel", (event) => {
    if (event.target != canvas) return;
    event.preventDefault();

    update_mouse_position(event);

    if (event.wheelDeltaX) do_horizontal_scrolling(-event.wheelDeltaX);
    if (event.wheelDeltaY) {
        if (event.ctrlKey) do_zooming(-event.wheelDeltaY/2);
        else do_horizontal_scrolling(event.wheelDeltaY);
    }
    if (event.deltaZ) do_zooming(event.deltaZ);
    redraw();
}, {passive: false});

let canvas_rect = canvas.getBoundingClientRect();
function update_mouse_position(event) {
    mouse_x = event.clientX - canvas_rect.x;
    mouse_y = event.clientY - canvas_rect.y;
}

function do_horizontal_scrolling(delta) {
    scroll_x_nanos += nanos_per_pixel * delta;
    clamp_horizontal_scroll();
}

let min_nanos_per_pixel_log = Math.log(1/100);
function do_zooming(delta) {
    nanos_per_pixel_log += delta / 500;
    let last_data = data[data.length - 1];
    let total_duration = last_data.start + last_data.duration - data[0].start;
    let max_nanos_per_pixel_log = Math.log(total_duration / 100);
    if (nanos_per_pixel_log < min_nanos_per_pixel_log) nanos_per_pixel_log = min_nanos_per_pixel_log;
    if (nanos_per_pixel_log > max_nanos_per_pixel_log) nanos_per_pixel_log = max_nanos_per_pixel_log;

    let nanos_per_pixel_was = nanos_per_pixel;
    nanos_per_pixel = Math.exp(nanos_per_pixel_log);
    scroll_x_nanos -= mouse_x * (nanos_per_pixel - nanos_per_pixel_was);
    clamp_horizontal_scroll();
}

function clamp_horizontal_scroll() {
    let start = data[0].start - canvas.width * nanos_per_pixel;
    let last_data = data[data.length - 1];
    let end = last_data.start + last_data.duration;
    if (scroll_x_nanos < start) scroll_x_nanos = start;
    if (scroll_x_nanos > end) scroll_x_nanos = end;
}

////////////////////////////////////////////////////////////////////////////////
// redraw

let time_last_redraw = -Infinity;
let time_now = null;
let timings_top = null;
let timings_height = null;
function redraw() {
    time_now = window.performance.now();
    if (time_now - time_last_redraw < 16.666) return;
    time_last_redraw = time_now;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    nanos_per_pixel = Math.exp(nanos_per_pixel_log);
    pixels_per_nano = 1 / nanos_per_pixel;

    ctx.fillStyle = 'red';
    ctx.strokeStyle = 'black';

    let y = 10;
    ctx.lineWidth = 1;

    // Draw highlighted region
    draw_highlighted_region();

    // Draw scale ruler
    y = draw_scale_ruler(y);

    //
    // Draw sections rectangles
    //
    ctx.fillStyle = 'black';
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'black';

    let highlighted_sections = [];
    let super_highlighted_section = null;

    var x = 0;
    timings_top = y + 10;
    timings_height = 20;

    i = 0;
    let sanity_check = 1000;
    let current_module_separators = [];
    let current_module_start_x = [];
    let current_module_end_x = [];
    let sections_to_name = [];
    for (let module_id = 0; module_id < modules_by_id.length; module_id++) {
        current_module_separators[module_id] = [];
        current_module_start_x[module_id] = 0;
        current_module_end_x[module_id] = -Infinity;
    }
    ctx.fillStyle = 'red';
    // for (let i = 0; i < data.length; i++) {
    for (let i = 0; i < data.length; i++) {
        let { start, duration, module_id, section_id } = data[i];

        let x = (start - scroll_x_nanos) * pixels_per_nano;
        let y = timings_top + module_id * timings_height;
        let w = duration * pixels_per_nano;
        if (x + w < 0) continue;
        if (x > canvas.width) break;

        if (w > 10) sections_to_name.push(i);

        if (mouse_x >= x && mouse_x <= x + w) {
            highlighted_sections.push(data[i]);
            if (mouse_y >= y && mouse_y <= y + timings_height)
                super_highlighted_section = data[i];
        }

        let prev_end = current_module_end_x[module_id];
        if (x - prev_end < 1) {
            current_module_separators[module_id].push(x + w);
            current_module_end_x[module_id] = x + w;
            continue;
        }

        let x0 = current_module_start_x[module_id];
        let x1 = current_module_end_x[module_id];
        ctx.fillRect(x0, y, x1 - x0, timings_height);
        draw_thin_rect(x0, y, x1 - x0, timings_height);

        let separators = current_module_separators[module_id];
        ctx.beginPath();
        for (let j = 0; j < separators.length - 1; j++) {
            let xj = separators[j];
            ctx.moveTo(xj, y);
            ctx.lineTo(xj, y + timings_height);
        }
        ctx.stroke();

        current_module_start_x[module_id] = x
        separators.length = 0;
        separators.push(x + w);
        current_module_end_x[module_id] = x + w;

        if (sanity_check-- <= 0) break;
    }
    for (let module_id = 0; module_id < modules_by_id.length; module_id++) {
        let x0 = current_module_start_x[module_id];
        if (x0 == 0) continue;
        let x1 = current_module_end_x[module_id];
        let y = timings_top + module_id * timings_height;
        ctx.fillRect(x0, y, x1 - x0, timings_height);
        draw_thin_rect(x0, y, x1 - x0, timings_height);

        let separators = current_module_separators[module_id];
        ctx.beginPath();
        for (let j = 0; j < separators.length - 1; j++) {
            let xj = separators[j];
            ctx.moveTo(xj, y);
            ctx.lineTo(xj, y + timings_height);
        }
        ctx.stroke();
    }

    ctx.fillStyle = '#303030';
    ctx.font = "14px bold serif";
    for (const i of sections_to_name) {
        draw_text_on_section_rect(data[i]);
    }

    //
    // Draw mouse stuff
    //
    ctx.fillStyle = '#80808080';
    ctx.fillRect(mouse_x, 0, 1, canvas.height);

    ctx.fillStyle = 'black';
    ctx.font = "20px bold serif";
    y = canvas.height - 2;

    y -= 20;

    //
    // Draw highlighted section text
    //
    if (super_highlighted_section) {
        let { start, duration, module_id, section_id } = super_highlighted_section;
        let x = (start - scroll_x_nanos) * pixels_per_nano;
        let y = timings_top + module_id * timings_height;
        let w = duration * pixels_per_nano;
        ctx.fillStyle = '#ff8080';
        ctx.fillRect(x, y, w, timings_height);
        // ctx.fillStyle('black');
        // javascript sucks fucking ass! I dont know why this dont work...
        // draw_text_on_section_rect(super_highlighted_section);
    }
    for (let i = 0; i < highlighted_sections.length; i++) {
        let { start, duration, module_id, section_id } = highlighted_sections[i];

        {
            let x = (start - scroll_x_nanos) * pixels_per_nano;
            let y = timings_top + module_id * timings_height;
            let w = duration * pixels_per_nano;
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'yellow';
            draw_thin_rect(x, y, w, timings_height);
        }

        let module = modules_by_id[module_id];
        let section = sections[section_id];
        ctx.fillStyle = 'black';
        ctx.fillText(`[${module}] ${section}: ${format_time(duration)} [start: ${format_time(start)}]`, 0 + 2, y);
        y -= 20;
    }

    // Draw highlighted region duration
    draw_highlighted_region_duration();

    // Draw super highlighted section info
    draw_super_highlighted_section_info(super_highlighted_section);
}

function draw_text_on_section_rect(section_info) {
    let { start, duration, module_id, section_id } = section_info;
    let w = duration * pixels_per_nano;

    let module = modules_by_id[module_id];
    let section = sections[section_id];
    let text = `[${module}] ${section}`;
    let [text_w, ya, yd] = text_dimensions(text);

    let padding = 3;
    let x = (start - scroll_x_nanos) * pixels_per_nano + padding;
    if (x < 0) x += Math.min(padding -x, w - text_w - 2 * padding);

    let y = timings_top + (module_id + 1) * timings_height - yd - padding;

    w -= padding * 2;
    if (text_w > w) text = text.substr(0, text.length / text_w * w);

    if (text.length > 1) ctx.fillText(text, x, y, w);
}

function draw_super_highlighted_section_info(section_info) {
    if (!section_info) return;
    let { start, duration, module_id, section_id } = section_info;

    // draw popup section info next to mouse cursor
    {
        ctx.fillStyle = 'black';
        ctx.font = "18px bold serif";
        let module = modules_by_id[module_id];
        let section = sections[section_id];
        let x = mouse_x + 4;
        let y = timings_top + module_id * timings_height + 36;
        let text = `[${module}] ${section}: ${format_time(duration)}`;
        let [w, ya, yd] = text_dimensions(text);
        ctx.fillStyle = '#303030c0';
        let rect_padding = 3;
        {
            let rect_x = x - rect_padding;
            let rect_y = y + yd + rect_padding;
            let rect_w = w + rect_padding * 2;
            let rect_h = ya + yd + rect_padding * 2;
            ctx.fillRect(rect_x, rect_y, rect_w, -rect_h);
        }
        ctx.fillStyle = '#e0e0e0';
        ctx.fillText(text, x, y);
    }

    // draw section stats in bottow right corner
    let right = canvas.width - 4;
    let bottom = canvas.height - 4;
    let occurences = 0;
    let total_duration = 0;
    let mean = 0;
    let min = Infinity;
    let max = 0;
    let start_of_section_with_max_duration = null;
    let standard_deviation = 0;

    for (const section_info of data) {
        if (section_info.module_id != module_id) continue;
        if (section_info.section_id != section_id) continue;

        let duration = section_info.duration;
        total_duration += duration;
        occurences += 1;
        min = Math.min(duration, min);
        if (duration > max) {
            max = duration;
            start_of_section_with_max_duration = section_info.start;
        }
    }

    mean = total_duration / occurences;
    for (const section_info of data) {
        if (section_info.module_id != module_id) continue;
        if (section_info.section_id != section_id) continue;

        let duration = section_info.duration;
        standard_deviation += duration * duration / occurences;
    }
    standard_deviation = Math.sqrt(standard_deviation - mean * mean);

    let text_lines = [];
    text_lines.push(`count: ${occurences}`);
    text_lines.push(`sum: ${format_time(total_duration)}`);
    text_lines.push(`max: ${format_time(max)}`);
    text_lines.push(`avg: ${format_time(mean)}`);
    text_lines.push(`sd: ${format_time(standard_deviation)}`);
    text_lines.push(`min: ${format_time(min)}`);

    let max_w = 0;
    let max_h = 0;
    for (const text of text_lines) {
        let [w, ya, yd] = text_dimensions(text);
        max_w = Math.max(w, max_w);
        max_h = Math.max(max_h, ya + yd);
    }

    ctx.fillStyle = 'black';
    let x = right - max_w;
    let y = bottom - 3;
    let i = text_lines.length - 1;
    while (i >= 0) {
        let text = text_lines[i];
        i--;
        ctx.fillText(text, x, y);
        y -= timings_height + 3;
    }

    ctx.fillStyle = 'red';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 1;
    let bars_right = x - 5;
    y = bottom - timings_height;

    let duration_value = min;
    {
        let w = duration_value * pixels_per_nano;
        let x = bars_right - w;
        ctx.fillRect(x, y, w, timings_height);
        draw_thin_rect(x, y, w, timings_height);
        y -= timings_height + 3;
    }

    duration_value = standard_deviation;
    {
        let w = duration_value * pixels_per_nano;
        let x = bars_right - w;
        ctx.fillRect(x, y, w, timings_height);
        draw_thin_rect(x, y, w, timings_height);
        y -= timings_height + 3;
    }

    duration_value = mean;
    {
        let w = duration_value * pixels_per_nano;
        let x = bars_right - w;
        ctx.fillRect(x, y, w, timings_height);
        draw_thin_rect(x, y, w, timings_height);
        y -= timings_height + 3;
    }

    duration_value = max;
    {
        let w = duration_value * pixels_per_nano;
        let x = bars_right - w;
        ctx.fillRect(x, y, w, timings_height);
        draw_thin_rect(x, y, w, timings_height);

        let text = `start: ${format_time(start_of_section_with_max_duration)}`;
        let [text_w, text_ya, text_yd] = text_dimensions(text);
        let text_padding = 3;

        let text_x;
        let text_y = y + timings_height - text_padding;
        if (text_w > w - 2 * text_padding) {
            text_x = x - text_w - text_padding * 2;
        } else {
            text_x = bars_right - text_w - text_padding;
        }
        ctx.fillStyle = 'black';
        ctx.fillText(text, text_x, text_y);

        y -= timings_height + 3;
    }

    ctx.fillStyle = 'red';
    duration_value = total_duration;
    {
        let w = duration_value * pixels_per_nano;
        let x = bars_right - w;
        ctx.fillRect(x, y, w, timings_height);
        draw_thin_rect(x, y, w, timings_height);
        y -= timings_height + 3;
    }

}

function format_time(nanos, scale) {
    let maximumFractionDigits = 3;
    if (nanos < 1000) {
        nanos = nanos.toLocaleString('en-US', { maximumFractionDigits });
        return `${nanos}ns`;
    }
    if (nanos < 1000_000) {
        if (scale && scale < 1000) maximumFractionDigits = 6;
        let micros = nanos / 1000;
        micros = micros.toLocaleString('en-US', { maximumFractionDigits });
        return `${micros}\xb5s`;
    }
    if (nanos < 1000_000_000) {
        if (scale && scale < 1000) maximumFractionDigits = 6;
        let millis = nanos / 1000_000;
        millis = millis.toLocaleString('en-US', { maximumFractionDigits });
        return `${millis}ms`;
    }

    if (scale && scale < 1000) maximumFractionDigits = 9;
    if (scale && scale < 1000_000) maximumFractionDigits = 6;
    let seconds = nanos / 1000_000_000;
    seconds = seconds.toLocaleString('en-US', { maximumFractionDigits });
    return `${seconds}s`;
}

function draw_thin_rect(x, y, w, h) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y);
    ctx.stroke();
}

function draw_scale_ruler(y) {
    let x = 0;

    let mouse_nanos = scroll_x_nanos + mouse_x * nanos_per_pixel;

    // Determine the adequet scale
    let current_pow10_scale = Math.pow(10, Math.floor(Math.log10(100 * nanos_per_pixel)));
    let pixels_pow10 = pixels_per_nano * current_pow10_scale;
    let current_scale = current_pow10_scale;
    let pixels = pixels_pow10;
    if (pixels_pow10 < 40) {
        current_pow10_scale *= 10;
        pixels_pow10 *= 10;
        current_scale = current_pow10_scale * .4;
        pixels = pixels_pow10 * .4;
    }
    if (pixels > 100) {
        current_scale /= 2;
        pixels /= 2;
    }

    //
    // draw the ruler
    //
    ctx.beginPath();

    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);

    {
        h = 15;
        let closest_multiple = Math.ceil(scroll_x_nanos / current_pow10_scale) * current_pow10_scale;
        let x0 = (closest_multiple - scroll_x_nanos) * pixels_per_nano;
        for (let x = x0; x < canvas.width; x += pixels_pow10) {
            ctx.moveTo(x, y - h / 2);
            ctx.lineTo(x, y + h / 2);
        }

        h = 8;
        let previous_pow10_scale = current_pow10_scale / 10;
        let pixels = pixels_pow10 / 10;
        let x = x0 - pixels_pow10;
        while (x < canvas.width) {
            x += pixels;
            for (let i = 0; i < 9; i++) {
                ctx.moveTo(x, y - h / 2);
                ctx.lineTo(x, y + h / 2);
                x += pixels;
            }
        }
    }

    ctx.stroke();

    y += 15;

    //
    // draw current scale indicator on the ruler
    //
    {
        let granularity = current_scale;
        let mouse_closest_multiple = Math.floor(mouse_nanos / granularity) * granularity;
        let offset = 0;
        x0 = (mouse_closest_multiple - scroll_x_nanos) * pixels_per_nano + offset;

        let text = `${format_time(current_scale)}`;
        ctx.font = "14px bold serif";
        let m = ctx.measureText(text);

        h /= 1.31;
        ctx.strokeStyle = '#808080';
        ctx.beginPath();
        ctx.moveTo(x0, y - h / 2);
        ctx.lineTo(x0, y + h / 2);

        ctx.moveTo(x0, y);
        let l = pixels / 2 - m.width / 2 - 3;
        ctx.lineTo(x0 + l, y);
        ctx.moveTo(x0 + pixels - l, y);
        ctx.lineTo(x0 + pixels, y);

        ctx.moveTo(x0 + pixels, y - h / 2);
        ctx.lineTo(x0 + pixels, y + h / 2);
        ctx.stroke();

        ctx.fillStyle = '#808080';
        y += 5;
        x = x0 + pixels / 2 - m.width / 2;
        ctx.fillText(text, x, y);
    }

    y += 16;

    //
    // draw time at mouse location
    //
    if (mouse_x !== null) {
        x = mouse_x + 4;
        ctx.fillText(`${format_time(mouse_nanos, current_scale)}`, x, y);
    }

    return y;
}

function draw_highlighted_region() {
    if (!mouseDown) return;

    ctx.fillStyle = '#8080f060';
    ctx.fillRect(mouse_x_start, 0, mouse_x - mouse_x_start, canvas.height);
}

function draw_highlighted_region_duration() {
    if (!mouseDown) return;

    let t0 = scroll_x_nanos + mouse_x_start * nanos_per_pixel;
    let t1 = scroll_x_nanos + mouse_x * nanos_per_pixel;
    let x = mouse_x + 6;
    let y = mouse_y - 6;
    ctx.fillStyle = 'black';
    ctx.font = '14px bold serif';
    ctx.fillText(`${format_time(Math.abs(t1 - t0))}`, x, y);
}

function format_float(f, d) {
    if (d === undefined) d = 3;
    return f.toLocaleString('en-US', { maximumFractionDigits: d });
}

function text_dimensions(text) {
    let metrics = ctx.measureText(text);
    return [metrics.width, metrics.actualBoundingBoxAscent, metrics.actualBoundingBoxDescent];
}

redraw();
