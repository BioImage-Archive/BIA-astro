const api = "https://wwwdev.ebi.ac.uk/bioimage-archive/api/v2"

export function getPlaceholderHeroImage(accessionID) {
    const match = accessionID.match(/(\d{1,5})$/);
    const accessionIDNumber = parseInt(match[1]);
    const imageNumber = (accessionIDNumber % 45) + 1;
    return `/bioimage-archive/default-hero/placeholder_logo_${imageNumber}.png`
}

export function getStudyImage(study, cardImageOverride) {
    const datasetWithImage = study.dataset.find((dataset) => dataset.example_image_uri.length > 0)
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
      getSimpleAttributeValue(dataset, "annotation_type")?.join(", ") || []
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
      console.warn(`Failed to fetch  ${url}`, err);
      return null
  }
}

export async function getStudyUUIDFromImage(img){
  const datasetUUID = img.submission_dataset_uuid
  const dataset = await getFromAPI(`${api}/dataset/${datasetUUID}`);
  return dataset.submitted_in_study_uuid;
}

export async function getImage(uuid){
  const image = await getFromAPI(`${api}/image/${uuid}`);
  const enrichedImage = await getEnrichedImage(image);
  return enrichedImage;
}

export async function getEnrichedImage(img, creationProcess=null){
  const imageRepresentation = await getFromAPI(`${api}/image/${img.uuid}/image_representation?page_size=5`);
  img.creation_process = creationProcess? creationProcess[img.creation_process_uuid]: await getFromAPI(`${api}/creation_process/${img.creation_process_uuid}`);
  img.representation = imageRepresentation;
  return img
}

export async function getImagesForAIGallery(datasets){
  const imageEntries = await Promise.all(
    datasets.map(async dataset => {
      const images = dataset.image;
      const creationProcess = await getUniqueObjectsFromEndpoint(images, "creation_process_uuid", `${api}/creation_process`)
      const enrichedImages = await Promise.all(
        images.map(async img => {return [img.uuid, await getEnrichedImage(img, creationProcess)]})
      );
      return enrichedImages;
    })
  )
  return Object.fromEntries(imageEntries.flat());

}

async function getUniqueObjectsFromEndpoint(objs, method, endpoint){
  const uniqueUUID = [...new Set(
    objs.flatMap(obj =>{
      return getSimpleAttributeValue(obj, method)?.filter(Boolean)|| obj[method] || []
      })
  )];
  let results = [];
  results = await Promise.all(
    uniqueUUID.map(async uuid => {
      return [uuid, await getFromAPI(`${endpoint}/${uuid}`)]
    })
  );
  return Object.fromEntries(results)
}

function getmethodFromUUID(obj, method, methodDict){
  const uuids = getSimpleAttributeValue(obj, method)?.filter(Boolean) || [];
  return uuids? uuids.map(uuid => methodDict?.[uuid] || []) : []
}

export async function getEnrichedDatasets(dataset, page, acquisitionProcess, biologicalEntities, annotationMethod) {
  const isStatic = page === "ai-image-static";
  if (isStatic){
    dataset.image = await getFromAPI(`${api}/dataset/${dataset.uuid}/image?page_size=10000`);
    return dataset
  }

  const isAiReady = page === "ai-ready";
  dataset.acquisition_process = getmethodFromUUID(dataset, "image_acquisition_protocol_uuid", acquisitionProcess)
  dataset.biological_entity = getmethodFromUUID(dataset, "bio_sample_uuid", biologicalEntities)
  dataset.annotation_process = getmethodFromUUID(dataset, "annotation_method_uuid", annotationMethod)
  if (!isAiReady) {
    let fileReferenceSizeBytes = [];
    let images = []
    const data = await getFromAPI(`${api}/dataset/${dataset.uuid}/stats?page_size=10`);
    fileReferenceSizeBytes = data?.file_reference_size_bytes || [];
    dataset.file_reference_size_bytes = fileReferenceSizeBytes;
    images = await getFromAPI(`${api}/dataset/${dataset.uuid}/image?page_size=10000`);
    dataset.image = images;
  }
  return dataset;
}

export async function getStudiesforAIGallery(ids, idType, page) {
  const studyEntries = await Promise.all(
    ids.map(async id => {
        const study = idType === "accession"? 
        await getFromAPI(`${api}/search/study/accession?accession_id=${id}&page_size=1`) 
        : await getFromAPI(`${api}/study/${id}`);
      const uuid = study?.uuid;
      const datasets = await getFromAPI(`${api}/study/${uuid}/dataset?page_size=100`);
      const acquisitionProcess = await getUniqueObjectsFromEndpoint(datasets, "image_acquisition_protocol_uuid", `${api}/image_acquisition_protocol`)
      const biologicalEntities = await getUniqueObjectsFromEndpoint(datasets, "bio_sample_uuid", `${api}/bio_sample`)
      const annotationMethod = await getUniqueObjectsFromEndpoint(datasets, "annotation_method_uuid", `${api}/annotation_method`)
      const enrichedDatasets = await Promise.all(
        datasets.map(async dataset => {return getEnrichedDatasets(dataset, page, acquisitionProcess, biologicalEntities, annotationMethod)}) 
      );
      study.dataset = enrichedDatasets;
      return [study.accession_id, study];
    })
  );
  return Object.fromEntries(studyEntries);
}