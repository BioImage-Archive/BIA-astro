export function get_placeholder_hero_image(accession_id) {
    const match = accession_id.match(/(\d{1,5})$/);
    const acc_id_number = parseInt(match[1]);
    const imageNumber = (acc_id_number % 45) + 1;
    return `/bioimage-archive/default-hero/placeholder_logo_${imageNumber}.png`
}

export function format_list_item(output_string, item, i, list) {
    if (i + 1 === list.length) {
        return output_string + item ;
    } else {
        return output_string + item + ", " ;
    }
}


export function taxon_render(taxon) {
    if (taxon["common_name"] && taxon["scientific_name"]){
        return `<i>${taxon.scientific_name}</i> (${taxon["common_name"]})`
    } else if (taxon["common_name"]) {
        return `${taxon.common_name}`
    } else if (taxon["scientific_name"]) {
        return `<i>${taxon.scientific_name}</i>`
    }
 }


export function multiline_text_render(value) {
    const output = value.toString().trim().replace(/(?:[\r\n|\r|\n]+)/g, "<br/><br/>")
    return output
}


export function format_bytes_to_human_size(size_bytes) {
    var i = size_bytes == 0 ? 0 : Math.floor(Math.log(size_bytes) / Math.log(1000));
    return `${Number(size_bytes / Math.pow(1000, i)).toFixed(2)} ${['B', 'kB', 'MB', 'GB', 'TB', 'PB'][i]}`
}
