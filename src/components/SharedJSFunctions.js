import { PUBLIC_SEARCH_API } from "astro:env/client";
const api = "https://wwwdev.ebi.ac.uk/bioimage-archive/api/v2"

export function getPlaceholderHeroImage(accessionID) {
    const match = accessionID.match(/(\d{1,5})$/);
    const accessionIDNumber = parseInt(match[1]);
    const imageNumber = (accessionIDNumber % 45) + 1;
    return `/bioimage-archive/default-hero/placeholder_logo_${imageNumber}.png`
}

export function getStudyImage(study, cardImageOverride) {
    const datasetWithImage = study.dataset.filter(ds => ds.acquisition_process.length > 0 && ds.annotation_process.length == 0).find((dataset) => dataset.example_image_uri.length > 0)
    if (cardImageOverride != null) {
      return cardImageOverride
    } else if (datasetWithImage == undefined) {
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
    return obj?.additional_metadata
      ?.find(attr => attr.name === attrName)
      ?.value[attrName] ?? null;
}
  
  
export function getDatasetStatsByUUID(study) {
    return aggregateDatasetStats(study.dataset);
}

export function aggregateDatasetStats(datasets) {
    const dataset_uuids = []
    for (var dataset of datasets) {
      dataset_uuids.push([dataset.uuid,dataset.file_reference_count,dataset.title])
    }
    return dataset_uuids
}

export function getImagingMethodType(study) {
    const imagingTypeList = []
    for (var dataset of study.dataset) {
        for (var ia of dataset.acquisition_process) {
            for (var methodNames of ia.imaging_method_name) {
                if (!imagingTypeList.includes(methodNames)) {
                    imagingTypeList.push(methodNames)
                }
            }
        }
    }
    return imagingTypeList
}

export function getTaxons(study) {
    const taxonHtmlList = []
    const taxonList = []
    for (var dataset of study.dataset) {
        for (var biosample of dataset.biological_entity) {
            for (var taxon of biosample.organism_classification) {
                if (!taxonList.some(txnFinal => txnFinal.common_name === taxon.common_name || txnFinal.scientific_name === taxon.scientific_name )) {
                    taxonList.push(taxon)
                    taxonHtmlList.push(taxonRender(taxon))
                }
            }
        }
    }
    return taxonHtmlList
}

export function getAnnotationType(dataset) {
  const fromAdditionalMetadata = dataset
    .flatMap(dataset =>
      dataset.additional_metadata
        ?.filter(md => md.name === "annotation_type")
        .map(md => md.value?.annotation_type?.[0].join(", ")) || []
    )
    .filter(Boolean); 
  if (fromAdditionalMetadata.length > 0) return fromAdditionalMetadata;
  const fromAnnotationProcess = dataset
    .map(dataset => dataset.annotation_process?.[0]?.method_type?.[0])
    .filter(Boolean);
  return fromAnnotationProcess;
}

export function getMetadataValue(mdArray, key, field = null) {
  const md = mdArray.find(md => md.name === key)?.value;
  return field && md ? md[field]?.[0] : md;
}

async function getFromAPI(url){
    try {
        const res = await fetch(url);
        return await res.json();
    } catch (err) {
        console.warn(`Failed to fetch ${url}`, err);
        return null
    }
}

export async function getStudyFromAPI(idType, id){
    let response;
    let study;
    switch (idType){
        case "accession":
            response = await getFromAPI(`${PUBLIC_SEARCH_API}/search/fts?query=${id}`);
            study = response?.hits?.hits?.[0]?._source || undefined;
            break;
        case "uuid":
            response = await getFromAPI(`${PUBLIC_SEARCH_API}/website/doc?uuid=${id}`);
            study = response?.hits?.[0]?._source || undefined;
            break;
        default:
            break;
    }
    return study
}

export async function getImageFromAPI(uuid){
    const response = await getFromAPI(`${PUBLIC_SEARCH_API}/search/fts/image?query=${uuid}`);
    const image = response?.hits?.hits?.[0]?._source; 
    return image
}

export async function getDataset(uuid){
  const dataset = await getFromAPI(`${api}/dataset/${uuid}`);
  return dataset;
}