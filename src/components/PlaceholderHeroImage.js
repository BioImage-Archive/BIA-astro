export function get_placeholder_hero_image(accession_id) {
    const match = accession_id.match(/(\d{1,5})$/);
    const acc_id_number = parseInt(match[1]);
    const imageNumber = (acc_id_number % 45) + 1;
    return `/bioimage-archive/default_hero/placeholder_logo_${imageNumber}.png`
}