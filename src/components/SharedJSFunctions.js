const api = "https://wwwdev.ebi.ac.uk/bioimage-archive/api/v2"
const searchAPI = "https://alpha.bioimagearchive.org/search/"

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
    if (!study.dataset?.some(ds => ds.biological_entity?.length)) {
      return [];
    }
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
        console.warn(`Failed to fetch ${url}`, err);
        return null
    }
}

export async function getDataset(uuid){
  const dataset = await getFromAPI(`${api}/dataset/${uuid}`);
  return dataset;
}

export async function getStudyUUIDFromImage(img){
    const datasetUUID = img.submission_dataset_uuid;
    const dataset = await getDataset(datasetUUID);
    return dataset.submitted_in_study_uuid;
}

export async function getImage(uuid, page=null){
    const image = await getFromAPI(`${api}/image/${uuid}`);
    const enrichedImage = await getEnrichedImage(image, null, page);
    return enrichedImage;
}

export async function getEnrichedSubject(subject){
    subject.sample_of = await Promise.all(subject.sample_of_uuid.map(async uuid => await getFromAPI(`${api}/bio_sample/${uuid}`)));
    subject.imaging_preparation_protocol = await Promise.all(subject.imaging_preparation_protocol_uuid.map(async uuid => await getFromAPI(`${api}/specimen_imaging_preparation_protocol/${uuid}`)));
    return subject
}

export async function getCreationProcessImage(creationProcess){
    creationProcess.acquisition_process = await Promise.all(creationProcess.image_acquisition_protocol_uuid.map(async uuid => await getFromAPI(`${api}/image_acquisition_protocol/${uuid}`)));
    creationProcess.annotation_method = await Promise.all(creationProcess.annotation_method_uuid.map(async uuid => await getFromAPI(`${api}/annotation_method/${uuid}`)));
    const specimenUUID = creationProcess?.subject_specimen_uuid || "";
    if (specimenUUID === ""){
      return creationProcess;
    }
    const subject = await getFromAPI(`${api}/specimen/${specimenUUID}`);
    creationProcess.subject = await getEnrichedSubject(subject);
    return creationProcess
}

export async function getEnrichedImage(img, creationProcess=null, page=null){
    const imageRepresentation = await getFromAPI(`${api}/image/${img.uuid}/image_representation?page_size=5`);
    img.creation_process = creationProcess? creationProcess[img.creation_process_uuid]: await getFromAPI(`${api}/creation_process/${img.creation_process_uuid}`);
    if (page === "browseImage"){
      img.creation_process = await getCreationProcessImage(img.creation_process)
    }
    img.representation = imageRepresentation;
    return img
}

export async function getImagesForAIGallery(datasets){
    const imageEntries = await Promise.all(
      datasets.map(async dataset => {
        const images = dataset.image;
        const creationProcess = await getUniqueObjectsFromEndpoint(images, "creation_process_uuid", `${api}/creation_process`);
        const enrichedImages = await Promise.all(
          images.map(async img => {return [img.uuid, await getEnrichedImage(img, creationProcess)]})
        );
        return enrichedImages;
      })
    )
    return Object.fromEntries(imageEntries.flat());
}

async function getUniqueObjectsFromEndpoint(objs, method, endpoint){
    try{  
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
      return Object.fromEntries(results)}
    catch(err){
      return null
    }
}

export async function getEnrichedStudies(objs, objType, page=null){
    const studyEntries = await Promise.all(objs.map(async obj => {
      let study;
      let uuid;
      switch (objType){
          case "accession":
            study = await getFromAPI(`${api}/search/study/accession?accession_id=${obj}&page_size=1`);
            uuid = study.uuid;
            study.dataset = Array.isArray(study.dataset) ? study.dataset : [];
            break;
          case "uuid":
            uuid = obj;
            break;
          case "all":
            study = obj;
            study.dataset = Array.isArray(study.dataset) ? study.dataset : [];
            uuid = study.uuid;
            break;
          default:
            study = [];
            break;
        }
        const response = await getFromAPI(`${searchAPI}website/doc?uuid=${uuid}`)
        const enrichedStudy = response?.hits?.[0]?._source || study
        const accessionID = enrichedStudy?.accession_id || study?.accession_id || `No accesion for ${obj}`;
        return [accessionID, enrichedStudy]
    }));
    return Object.fromEntries(studyEntries)
}

export async function getAllStudyMetadataFromSearchAPI(page, idType=null, ids=null ){
    let studies;
    if(page === "browse" || page ==="browse-static"){
      studies = await getFromAPI(`${api}/search/study?page_size=1000`);
      if (page ==="browse-static"){
        return studies;
      }

    }else if(page === "study"){
      studies = ids 
    }
    const enrichedStudies = await getEnrichedStudies(studies, idType);
    return enrichedStudies
}