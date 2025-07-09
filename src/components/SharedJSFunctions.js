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

export async function getStudyUUIDFromImage(img){
  const datasetUUID = img.submission_dataset_uuid
  const dataset = await fetch(`https://wwwdev.ebi.ac.uk/bioimage-archive/api/v2/dataset/${datasetUUID}`).then(res => res.json());
  return dataset.submitted_in_study_uuid
}

export async function getImage(uuid){
  const image = await fetch(`https://wwwdev.ebi.ac.uk/bioimage-archive/api/v2/image/${uuid}`).then(res => res.json());
  const enrichedImage = await getEnrichedImage(image)
  return enrichedImage
}

export async function getEnrichedImage(img){
  const creationProcess = await fetch(`https://wwwdev.ebi.ac.uk/bioimage-archive/api/v2/creation_process/${img.creation_process_uuid}`).then(res => res.json())
  const imageRepresentation = await fetch(`https://wwwdev.ebi.ac.uk/bioimage-archive/api/v2/image/${img.uuid}/image_representation?page_size=5`).then(res => res.json())
  img.creation_process = creationProcess
  img.representation = imageRepresentation
  return img

}

export async function getImagesForAIGallery(datasets){
  const imageEntries = await Promise.all(
    datasets.map(async dataset => {
      const images = dataset.image
      const enrichedImages = await Promise.all(
        images.map(async img => {return [img.uuid, await getEnrichedImage(img)]})
      )
      return enrichedImages
    })
  )
  const images = imageEntries.flat()
  return Object.fromEntries(images)

}

export async function getEnrichedDatasets(dataset, page) {
  const isStatic = page === "ai-image-static";
  const isAiReady = page === "ai-ready";

  const metadata = dataset.additional_metadata || [];

  // 1. Image Acquisition Process
  let acquisitionProcess = [];
  if (!isStatic) {
    const iapUUIDs = metadata
      .filter(md => md.name === "image_acquisition_protocol_uuid")
      .flatMap(md => md.value?.image_acquisition_protocol_uuid || [])
      .filter(Boolean);

    acquisitionProcess = await Promise.all(
      iapUUIDs.map(async uuid => {
        try {
          const res = await fetch(`https://wwwdev.ebi.ac.uk/bioimage-archive/api/v2/image_acquisition_protocol/${uuid}`);
          return await res.json();
        } catch (err) {
          console.warn(`Failed to fetch acquisition protocol for ${uuid}`, err);
          return null;
        }
      })
    );
  }

  // 2. Biological Entities
  let biologicalEntities = [];
  if (!isStatic) {
    const sampleUUIDs = metadata
      .filter(md => md.name === "bio_sample_uuid")
      .flatMap(md => md.value?.bio_sample_uuid || [])
      .filter(Boolean);

    biologicalEntities = await Promise.all(
      sampleUUIDs.map(async uuid => {
        try {
          const res = await fetch(`https://wwwdev.ebi.ac.uk/bioimage-archive/api/v2/bio_sample/${uuid}`);
          return await res.json();
        } catch (err) {
          console.warn(`Failed to fetch bio_sample for ${uuid}`, err);
          return null;
        }
      })
    );
  }

  // 3. Annotation Method
  let annotationMethod = [];
  if (!isStatic) {
    const annotationUUID = metadata.find(md => md.name === "annotation_method_uuid")
      ?.value?.annotation_method_uuid?.[0];

    if (annotationUUID) {
      try {
        const res = await fetch(`https://wwwdev.ebi.ac.uk/bioimage-archive/api/v2/annotation_method/${annotationUUID}`);
        annotationMethod = [await res.json()];
      } catch (err) {
        console.warn(`Failed to fetch annotation method for ${annotationUUID}`, err);
      }
    }
  }

  // 4. File Reference Size
  let fileReferenceSizeBytes = [];
  if (!isStatic && !isAiReady) {
    try {
      const res = await fetch(`https://wwwdev.ebi.ac.uk/bioimage-archive/api/v2/dataset/${dataset.uuid}/stats?page_size=10`);
      const data = await res.json();
      fileReferenceSizeBytes = data.file_reference_size_bytes || [];
    } catch (err) {
      console.warn(`Failed to fetch dataset stats for ${dataset.uuid}`, err);
    }
  }

  // 5. Images
  let images = [];
  if (!isAiReady) {
    try {
      const res = await fetch(`https://wwwdev.ebi.ac.uk/bioimage-archive/api/v2/dataset/${dataset.uuid}/image?page_size=10000`);
      images = await res.json();
    } catch (err) {
      console.warn(`Failed to fetch images for dataset ${dataset.uuid}`, err);
    }
  }

  // Assign to dataset
  dataset.acquisition_process = acquisitionProcess.filter(Boolean);
  dataset.biological_entity = biologicalEntities.filter(Boolean);
  dataset.annotation_process = annotationMethod;
  dataset.file_reference_size_bytes = fileReferenceSizeBytes;
  dataset.image = images;

  return dataset;
}


export async function getStudiesforAIGallery(ids, idType, page) {
  const studyEntries = await Promise.all(
    ids.map(async id => {
        const study = idType === "accession"? 
        await fetch(`https://wwwdev.ebi.ac.uk/bioimage-archive/api/v2/search/study/accession?accession_id=${id}&page_size=1`).then(res => res.json()) 
        : await fetch(`https://wwwdev.ebi.ac.uk/bioimage-archive/api/v2/study/${id}`).then(res => res.json());
      
      const uuid = study?.uuid;
      const datasets = await fetch(`https://wwwdev.ebi.ac.uk/bioimage-archive/api/v2/study/${uuid}/dataset?page_size=100`).then(res => res.json());
      const enrichedDatasets = await Promise.all(
        datasets.map(async dataset => {return getEnrichedDatasets(dataset, page)}) 
      );
      study.dataset = enrichedDatasets;
      return [study.accession_id, study];
    })
  );
  return Object.fromEntries(studyEntries);
}