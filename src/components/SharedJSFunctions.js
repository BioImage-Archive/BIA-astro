export function getPlaceholderHeroImage(accessionID) {
    const match = accessionID.match(/(\d{1,5})$/);
    const accessionIDNumber = parseInt(match[1]);
    const imageNumber = (accessionIDNumber % 45) + 1;
    return `/bioimage-archive/default-hero/placeholder_logo_${imageNumber}.png`
}

export function getStudyImage(study) {
    const datasetWithImage = study.dataset.find((dataset) => dataset.example_image_uri.length > 0)
    if (datasetWithImage === undefined) {
      return getPlaceholderHeroImage(study.accession_id)
    } else {
      return datasetWithImage.example_image_uri[0]
    }
  }

export function formatListItem(outputString, item, i, list) {
    if (i + 1 === list.length) {
        return `${outputString}${item}` ;
    } else {
        return `${outputString}${item}, ` ;
    }
}


export function taxonRender(taxon) {
    if (taxon["common_name"] && taxon["scientific_name"]){
        return `<i>${taxon.scientific_name}</i> (${taxon["common_name"]})`
    } else if (taxon["common_name"]) {
        return `${taxon.common_name}`
    } else if (taxon["scientific_name"]) {
        return `<i>${taxon.scientific_name}</i>`
    }
 }


export function multilineTextRender(value) {
    const output = value.toString().trim().replace(/(?:[\r\n|\r|\n]+)/g, "<br/><br/>")
    return output
}


export function formatBytesToHumanSize(sizeBytes) {
    var i = sizeBytes == 0 ? 0 : Math.floor(Math.log(sizeBytes) / Math.log(1000));
    return `${Number(sizeBytes / Math.pow(1000, i)).toFixed(2)} ${['B', 'kB', 'MB', 'GB', 'TB', 'PB'][i]}`
}

export function getSimpleAttributeValue(obj, attrName) {
    // For attributes of structure: { "name": "AttributeName", "value": { "AttributeName": <value> } }
    return obj?.attribute
      ?.find(attr => attr.name === attrName)
      ?.value[attrName] ?? null;
}
  
  
export function getDatasetStatsByUUID(study) {
    const dataset_uuids = []
    for (var dataset of study.dataset) {
      dataset_uuids.push([dataset.uuid,dataset.file_reference_count,dataset.title_id])
    }
    return dataset_uuids
}
  