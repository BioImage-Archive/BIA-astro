import { PUBLIC_SEARCH_API, PUBLIC_MONGO_API } from "astro:env/client";
import imageFallback from "../assets/bioimage-archive/image_fallback.png"

export function getPlaceholderHeroImage(accessionID) {
    const match = accessionID.match(/(\d{1,5})$/);
    const accessionIDNumber = parseInt(match[1]);
    const imageNumber = (accessionIDNumber % 45) + 1;
    return `/bioimage-archive/default-hero/placeholder_logo_${imageNumber}.png`
}

export function getStudyImage(study, cardImageOverride) {
    const datasetWithImage = study.dataset.filter(ds => ds?.acquisition_process?.length > 0 && ds?.annotation_process?.length == 0).find((dataset) => dataset.example_image_uri.length > 0) ?? study.dataset.filter(ds => ds.example_image_uri.length > 0)[0];
    if (cardImageOverride != null) {
      return cardImageOverride
    } else if (datasetWithImage == undefined || datasetWithImage.example_image_uri[0] === undefined) {
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
    return aggregateDatasetStats(study?.dataset || []);
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

export function getAnnotationType(datasets) {
  const annotationTypes = new Set();

  datasets.forEach(dataset => {
    // 1. Process annotation_type from additional_metadata
    const annotationMetaData = dataset.additional_metadata?.find(md => md.name === "annotation_type");

    if (annotationMetaData) {
      if (Array.isArray(annotationMetaData.value?.annotation_type)) {
        // Case 1: It's an array of arrays!
        // We need to iterate through the outer array, and then through the inner array.
        annotationMetaData.value.annotation_type.forEach(innerArray => {
          if (Array.isArray(innerArray)) {
            innerArray.forEach(type => {
              if (typeof type === 'string') {
                annotationTypes.add(type.replace(/_/g, ' ').trim().toLowerCase());
              }
            });
          } else if (typeof innerArray === 'string') {
            annotationTypes.add(innerArray.replace(/_/g, ' ').trim().toLowerCase());
          }
        });
      } else if (typeof annotationMetaData.value === 'string') {
        // Case 2: It's a direct string (e.g., "type1,type2" or just "type1")
        annotationMetaData.value.split(',').forEach(typePart => {
          const cleanedType = typePart.replace(/_/g, ' ').trim().toLowerCase();
          if (cleanedType) {
            annotationTypes.add(cleanedType);
          }
        });
      }
    }

    // 2. Fallback to method_type from annotation_process
    // This comes from the logic in [accessionID].astro page
    if (dataset.annotation_process && dataset.annotation_process.length > 0) {
      dataset.annotation_process.forEach(process => {
        if (process.method_type && Array.isArray(process.method_type) && process.method_type.length > 0) {
          process.method_type.forEach(type => {
            if (typeof type === 'string') {
              const cleanedType = type.replace(/_/g, ' ').trim().toLowerCase();
              if (cleanedType) {
                annotationTypes.add(cleanedType);
              }
            }
          });
        }
      });
    }
  });

  // Convert Set to Array and sort for consistent display
  return Array.from(annotationTypes).sort();
}

export function getMetadataValue(mdArray, key, field = null) {
  const md = mdArray.find(md => md.name === key)?.value;
  return field && md ? md[field]?.[0] : md;
}

export function getThumbnail(img) {
    const thumbnail_uri = getMetadataValue(img.additional_metadata, "image_thumbnail_uri")?.["256"]?.["uri"] || imageFallback.src;
    return thumbnail_uri;
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
            response = await getFromAPI(`${PUBLIC_SEARCH_API}/search/fts?query=${identifier}`);
            study = response?.hits?.hits?.find(
                (hit) => hit._source?.accession_id === identifier
              )?._source || undefined;
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

export async function getAllStudiesFromAPI(){
  const firstPage = await getFromAPI(
      `${PUBLIC_SEARCH_API}/search/fts?query=&pagination.page_size=100`
    );
    if (!firstPage) return null;

    const totalPages = firstPage.pagination.total_pages;
    const allHits = [...firstPage.hits.hits];

    const otherPages = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, i) =>
        getFromAPI(
          `${PUBLIC_SEARCH_API}/search/fts?query=&pagination.page_size=100&pagination.page=${i + 2}`,
          { hits: { hits: [] } }
        )
      )
    );

    otherPages.forEach((p) => allHits.push(...p.hits.hits));
    return allHits.map((hit) => hit._source);
}

function isImageAnAnnotation(img){
    return (img.creation_process?.input_image_uuid?.length && 
    img.representation.some(imgRep => imgRep.image_format === ".ome.zarr") &&
    !img?.additional_metadata?.some(md =>
        (
            md.value?.attributes?.["file description"] === "Raw image in JPEG format" || 
            md.value?.attributes?.["file description"] === "Visualization of groundtruth masks in PNG format" ||
            md.value?.attributes?.["file description"] === "Visualization of groundtruth for randomly selected nuclei in PNG format"
        )
    ))
}

export async function getSourceAnnotatedImagePairs(uuid){
    const creationProcessLinkingImage = await getFromAPI(`${PUBLIC_MONGO_API}/image/${uuid}/creation_process?page_size=20`)
    const imageLinkingCreationProcess = await Promise.all(creationProcessLinkingImage.flatMap( async (cp) => (await getFromAPI(`${PUBLIC_MONGO_API}/creation_process/${cp.uuid}/image?page_size=1`))[0]))
    const annotatedImages = (await Promise.all(imageLinkingCreationProcess.flatMap( async (img) => await getImageFromAPI(img.uuid)))).filter(img => isImageAnAnnotation(img));
    return annotatedImages
}

export async function generateSourceAnnotatedImageMap(study){
    const annotatedImagesMap = new Map();
    const skipImageUUID = ["2a382f3a-aa6d-4ace-99fb-468335fa3809", "8921dcfb-4f5b-4ac1-a390-04b3ef2155ea", "d0b3f24f-4a9c-499b-99e4-343de48e7c82"]
    const imagesFromStudies = study?.dataset?.flatMap(ds => ds.image).filter(img => !skipImageUUID.includes(img.uuid)) || [];
    const images = await Promise.all(imagesFromStudies.map(async (image) => await getImageFromAPI(image.uuid)));
    for (const img of Object.values(images)) {
        if (isImageAnAnnotation(img)) {
            const key = img.creation_process.input_image_uuid[0];
            if (skipImageUUID.includes(key)) {
              continue;
            }
            if (!annotatedImagesMap.has(key)) {
                annotatedImagesMap.set(key, []);
            }
            annotatedImagesMap.get(key).push(img);
        }
    }
    return annotatedImagesMap
}