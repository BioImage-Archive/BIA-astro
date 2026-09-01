import { PUBLIC_SEARCH_API } from "astro:env/client";
import imageFallback from "../assets/bioimage-archive/image_fallback.png"

export function getPlaceholderHeroImage(accessionID) {
    const match = (accessionID.match(/(\d{1,5})$/)) || ['0','1'];
    const accessionIDNumber = parseInt(match[1]);
    const imageNumber = (accessionIDNumber % 45) + 1;
    return `/bioimage-archive/default-hero/placeholder_logo_${imageNumber}.png`
}

export function getStudyImage(study, cardImageOverride) {
    const studyImage = study?.example_image_uri?.length > 0? study.example_image_uri?.[0]: getPlaceholderHeroImage(study.accession_id);

    if (cardImageOverride != null) {
      return cardImageOverride
    }
    return studyImage
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

export function formatMetresToHumanSize(metres) {
  var i = metres == 0 ? 0 : Math.floor(Math.log(metres) / Math.log(1000)) * -1;
  var formatted = `${Number(metres / Math.pow(1000, i*-1)).toFixed(0)} ${['mm', 'µm', 'nm', "pm"][i-1]}`
  return formatted;
}

function formatValueHumanReadable(fieldName, value) {
  const nValue = Number(value);
  if(Number.isNaN(nValue)) {
    return value;
  }
  if (fieldName.endsWith("(m/px)") || fieldName.endsWith("(m)")) {
    return formatMetresToHumanSize(nValue);
  }
  else if (fieldName.endsWith("(bytes)")) {
    return formatBytesToHumanSize(nValue);
  }
  else {
    return nValue;
  }
}

export function formatFieldName(fieldName, fieldValue) {
  const bIsCompared = fieldValue.startsWith(">") || fieldValue.startsWith("<") || fieldValue.startsWith("≤") || fieldValue.startsWith("≥");
  const bIsRange = fieldValue.includes("-");
  if(Number.isFinite(fieldValue)) {
    return formatValueHumanReadable(fieldName, fieldValue);
  }
  else if (bIsCompared) {
    const fieldValueNumeric = fieldValue.slice(1);
    return `${fieldValue[0]} ${formatValueHumanReadable(fieldName, fieldValueNumeric)}`;
  }
  else if (bIsRange) {
    const [start, end] = fieldValue.split("-");
    return `${formatValueHumanReadable(fieldName, start)} - ${formatValueHumanReadable(fieldName, end)}`;
  }
  else {
    return fieldValue;
  }
    
}

export function getSimpleAttributeValue(obj, attrName) {
    // For attributes of structure: { "name": "AttributeName", "value": { "AttributeName": <value> } }
    return obj?.additional_metadata
      ?.find(attr => attr.name === attrName)
      ?.value[attrName] ?? null;
}

export function getPublicVisualisationURI(uri) {
    if (!uri) {
        return null;
    }

    try {
        const url = new URL(uri);
        if (url.hostname === "livingobjects-int.ebi.ac.uk") {
            url.hostname = "livingobjects.ebi.ac.uk";
        }
        return url.toString();
    } catch {
        return uri;
    }
}

export function buildVizarrViewerURL(uri) {
    if (!uri) {
        return null;
    }

    const url = new URL("https://livingobjects.ebi.ac.uk/bioimaging-01-pub/bia-zarr-test/vizarr/index.html");
    url.searchParams.set("source", uri);
    return url.toString();
}

export function buildITKViewerURL(uri) {
    if (!uri) {
        return null;
    }

    const url = new URL("https://kitware.github.io/itk-vtk-viewer/app/");
    url.searchParams.set("fileToLoad", uri);
    return url.toString();
}
  
export function getLicenceLogo(licenceURL){
    const isCreativeCommons = licenceURL.includes("creativecommons");
    if (isCreativeCommons){
      var logoURL = "http://mirrors.creativecommons.org/presskit/buttons/88x31/svg/";
      if (licenceURL.includes("publicdomain/zero")){
        return logoURL+= "cc-zero.svg"
      }
      const licenceImage = licenceURL.split("licenses")[1].split("/")[1]
      logoURL += `${licenceImage}.svg`;
      return logoURL
    }
    else{
      return ""
    }
    

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
    for (var methodNames in study?.imaging_method){
      if (!imagingTypeList.includes(methodNames)) {
                    imagingTypeList.push(methodNames)
                }
    }
    return imagingTypeList
}

export function getTaxons(study) {
    const taxonHtmlList = []
    const taxonList = []
    if (study?.organism_classification){
      for (var taxon of study?.organism_classification) {
          if (!taxonList.some(txnFinal => txnFinal.common_name === taxon.common_name || txnFinal.scientific_name === taxon.scientific_name )) {
              taxonList.push(taxon)
              taxonHtmlList.push(taxonRender(taxon))
          }
      }
    }
    return taxonHtmlList
}
export function renderTaxonList(study) {
    const taxonList = getTaxons(study)
    return taxonList.reduce(formatListItem, "")
}

export function highlightOrganism(study, query){
    const text = renderTaxonList(study)
    return query && text? applyHighlight(text, query): text;
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
  const md = mdArray?.find(md => md.name === key)?.value;
  return field && md ? md[field]?.[0] : md;
}

export function getThumbnail(img) {
    const thumbnail_uri = getMetadataValue(img.additional_metadata, "image_thumbnail_uri")?.["256"]?.["uri"] || imageFallback.src;
    return thumbnail_uri;
}

export function formatBytes(value, field){
  return field === "total_size_in_bytes"? formatBytesToHumanSize(value) : value
}

function formatPhysicalDimension(value, text) {
    if (text === "" && value !== 1) {
        if (value != null) {
            return Number(value).toPrecision(2)
        } else {
            return text
        }
    } else {
        if (value != null && value !== 1) {
            return text + " x " + Number(value).toPrecision(2)
        } else {
            return text
        }
    }
}

export function formatPhysicalVoxelDimensions(imageRepresentation) {
    const fields = [ "voxel_physical_size_x", "voxel_physical_size_y", "voxel_physical_size_z"]
    const formattedStr =  fields.reduce((text, field) => formatPhysicalDimension(imageRepresentation[field], text), "")
    return formattedStr != "" ? formattedStr + " m/pixel" : 'Unknown'
}

export function formatPhysicalDimensions(image) {
    const fields = [ "total_physical_size_x", "total_physical_size_y", "total_physical_size_z"]
    const formattedStr =  fields.reduce((text, field) => formatPhysicalDimension(image[field], text), "")
    return formattedStr != "" ? formattedStr + " m" : 'Unknown'
}


function formatPixelDimension(value, text) {
    if (text === "") {
        if (value != null && value !== 1) {
            return value
        } else {
            return text
        }
    } else {
        if (value != null && value !== 1) {
            return text + " x " + value
        } else {
            return text
        }
    }
}

export function formatPixelDimensions(img_rep) {
    const fields = [ "size_x", "size_y", "size_z"]
    return fields.reduce((text, field) => formatPixelDimension(img_rep[field], text), "") + " px" 
}

export function generateParamString(baseURL, query, page, selectedFacets, pageSize, sortBy = "", sortOrder = "", sortSource = ""){
  const url = new URL(baseURL, "http://local");
  const isPageURL = url.origin === "http://local";
  const hasQuery = query !== undefined && query !== null && query !== "";
  const hasFacetValues = Object.values(selectedFacets ?? {}).some((values) => values?.length > 0);
  const shouldKeepSort = sortBy && (sortBy !== "relevance" || sortSource === "user" || hasQuery || hasFacetValues);

  if (hasQuery) {
    url.searchParams.set("query", query ?? "");
  }

  if (!isPageURL || pageSize > 12) {
    url.searchParams.set("pagination.page_size", String(pageSize));
  }

  if (!isPageURL) {
    url.searchParams.set("pagination.page", String(page));
  }

  url.searchParams.delete("sortBy");
  url.searchParams.delete("sortOrder");
  url.searchParams.delete("sort_by");
  url.searchParams.delete("sort_order");
  url.searchParams.delete("sort_source");

  if (shouldKeepSort) {
    url.searchParams.set("sort_by", sortBy);
    url.searchParams.set("sort_order", sortOrder || "desc");
    if (isPageURL && sortSource) {
      url.searchParams.set("sort_source", sortSource);
    }
  }

  for (const [facetKey, values] of Object.entries(selectedFacets ?? {})) {
    url.searchParams.delete(facetKey);
    url.searchParams.delete(`${facetKey}.eq`);
    url.searchParams.delete(`${facetKey}.gt`);
    url.searchParams.delete(`${facetKey}.gte`);
    url.searchParams.delete(`${facetKey}.lt`);
    url.searchParams.delete(`${facetKey}.lte`);

    if (!values?.length) continue;

    for (const value of values) {
      if (value === null || value === undefined) continue;
      const stringValue = String(value).trim();
      if (stringValue === "") continue;

      if (isPageURL) {
        url.searchParams.append(facetKey, stringValue);
      }
      else if (stringValue.includes("-")) {
        const [start, end] = stringValue.split("-");
        url.searchParams.append(`${facetKey}.gte`, start);
        url.searchParams.append(`${facetKey}.lte`, end);
      }
      else if (stringValue[0] === ">") {
        url.searchParams.append(`${facetKey}.gt`, stringValue.slice(1));
      }
      else if (stringValue[0] === "<") {
        url.searchParams.append(`${facetKey}.lt`, stringValue.slice(1));
      }
      else if (stringValue[0] === "≤") {
        url.searchParams.append(`${facetKey}.lte`, stringValue.slice(1));
      }
      else if (stringValue[0] === "≥") {
        url.searchParams.append(`${facetKey}.gte`, stringValue.slice(1));
      }
      else if (facetKey === "has_converted_image" && !isPageURL) {
        url.searchParams.append(url.pathname.endsWith("image") ? "has.converted_image" : "has.thumbnail", "true");
      }
      else {
        url.searchParams.append(`${facetKey}.eq`, stringValue);
      }
    }
  }

  return isPageURL ? `${url.pathname}${url.search}` : url.toString()
}

export async function getFromAPI(url){
    try {
        const res = await fetch(url);
        return await res.json();
    } catch (err) {
        console.warn(`Failed to fetch ${url}`, err);
        return null
    }
}

export async function getStudyFromApiByUUID(uuid){
    // This can work with dataset uuid or study uuid.
    const response = await getFromAPI(`${PUBLIC_SEARCH_API}/website/study?query=${uuid}`);
    const study = response?.hits?.hits?.[0]?._source; 
    return study
}

export async function getStudyFromApiByAccession(accessionID){
    const response = await getFromAPI(`${PUBLIC_SEARCH_API}/website/study?facet.accession_id=${accessionID}`);
    const study = response?.hits?.hits?.find(
        (hit) => hit._source?.accession_id === accessionID
      )?._source || undefined;
    return study;
}

export async function getImageFromAPI(uuid){
    const response = await getFromAPI(`${PUBLIC_SEARCH_API}/website/image?query=${uuid}`);
    const image = response?.hits?.hits?.[0]?._source || null;
    return image
}

export async function getImagesFromAPI(uuid_list){
  const image_list = await Promise.all(
    uuid_list.map((uuid) => getImageFromAPI(uuid))
  );
  return image_list;
}


async function getAllPaginatedHits(urlBuilder, pageSize = 100) {
  const firstPage = await getFromAPI(urlBuilder(1, pageSize));

  if (!firstPage) return [];

  const totalPages = firstPage.pagination?.total_pages ?? 1;
  const allHits = [...(firstPage.hits?.hits ?? [])];

  const otherPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) =>
      getFromAPI(urlBuilder(i + 2, pageSize), { hits: { hits: [] } })
    )
  );

  otherPages.forEach((page) => {
    allHits.push(...(page?.hits?.hits ?? []));
  });

  return allHits;
}

export async function getImagesByAccessionID(accessionID) {
  const hits = await getAllPaginatedHits((page, pageSize) =>
    `${PUBLIC_SEARCH_API}/website/image` +
    `?facet.accession_id=${encodeURIComponent(accessionID)}` +
    `&pagination.page_size=${pageSize}` +
    `&pagination.page=${page}`
  );

  return hits.map((hit) => hit._source).filter(Boolean);
}

export async function getAllStudiesFromAPI() {
  const hits = await getAllPaginatedHits((page, pageSize) =>
    `${PUBLIC_SEARCH_API}/website/browse/study` +
    `?pagination.page_size=${pageSize}` +
    `&pagination.page=${page}`
  );

  return hits.map((hit) => hit._source).filter(Boolean);
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

export async function getAnnotationFromDerivedImages(sourceImageUUID) {
  const derivedImages = await getDerivedImagesFromSourceImage(sourceImageUUID)
  const annotatedImages = derivedImages.filter(img => isImageAnAnnotation(img))
  return annotatedImages  
}

async function getDerivedImagesFromSourceImage(uuid){
    const response = await getFromAPI(`${PUBLIC_SEARCH_API}/website/image?query=${uuid}&includeDerivedImages=true`);
    const derivedImages = response?.hits?.hits.map(img => img._source).filter(img => img.uuid !== uuid);
    return derivedImages
}

export async function generateSourceAnnotatedImageMap(accession_id) {
  const annotatedImagesMap = new Map();

  const skipImageUUID = [
    "2a382f3a-aa6d-4ace-99fb-468335fa3809",
    "8921dcfb-4f5b-4ac1-a390-04b3ef2155ea",
    "d0b3f24f-4a9c-499b-99e4-343de48e7c82",
  ];

  const images = await getImagesByAccessionID(accession_id);

  const sourceImagesByUuid = new Map(
    images
      .filter(img => img && !isImageAnAnnotation(img))
      .filter(img => !skipImageUUID.includes(img.uuid))
      .map(img => [img.uuid, img])
  );

  for (const img of images) {
    if (!img || !isImageAnAnnotation(img)) {
      continue;
    }

    const sourceImageUuid = img.creation_process?.input_image_uuid?.[0];

    if (!sourceImageUuid || skipImageUUID.includes(sourceImageUuid)) {
      continue;
    }

    const sourceImage = sourceImagesByUuid.get(sourceImageUuid);

    if (!sourceImage) {
      continue;
    }

    if (!annotatedImagesMap.has(sourceImageUuid)) {
      annotatedImagesMap.set(sourceImageUuid, {
        sourceImage,
        annotationImages: [],
      });
    }

    annotatedImagesMap.get(sourceImageUuid).annotationImages.push(img);
  }

  return annotatedImagesMap;
}

export function getTutorialURLs(urlType){
    const quickTourURL = "https://www.ebi.ac.uk/training/online/courses/bioimage-archive-quick-tour"
    return urlType === "submission"? `${quickTourURL}/submitting-data-to-bioimage-archive-2/submission/` : quickTourURL
}

export function highlightText(text, query) {
  return query && text ? applyHighlight(text, query) : text;
}

export function formatUniqueList(values = [], { sort = true, transform = value => value } = {}) {
  if(values == null){
    return ""
  }
  const items = values
    .filter(Boolean)
    .map(transform);

  const unique = [...new Set(items)];
  if (sort) unique.sort();

  return unique.join(", ");
}

export function formatHighlightedList(values = [], query, options = {}) {
  return highlightText(formatUniqueList(values, options), query);
}


export function applyHighlight(text, query) {
  const out = text ?? "";
  if (!query) return out;

  // If it's already highlighted, keep it (prevents double-highlighting / nesting)
  if (out.includes("__HIT__")) return out;

  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(escapedQuery, "gi");

  // Split into ["text", "<tag>", "text", ...] and only replace in text parts
  return out
    .split(/(<[^>]*>)/g)
    .map(part => {
      if (part.startsWith("<") && part.endsWith(">")) return part; // keep tags untouched
      return part.replace(re, m => `__HIT__${m}__/HIT__`);
    })
    .join("");
}

export function textFragmentLink(baseUrl, highlightStr, query) {
  const clean = highlightStr.replace(/__HIT__|__\/HIT__/g, "").trim();
  if (!clean || !clean.toLowerCase().includes(query.toLowerCase()) ) return baseUrl;
  return `${baseUrl}#:~:text=${encodeURIComponent(clean)}`;
}

export function highlightLinks(baseUrl, highlightObj, query, limit = 8) {
  if (!query ){ return baseUrl}
  const vals = Object.values(highlightObj || {}).flat();
  const uniq = [...new Set(vals)].slice(0, limit);
  return uniq.flatMap(h => ({ text: h[0]?.replace(/__HIT__|__\/HIT__/g, "").trim(), url: textFragmentLink(baseUrl, h, query) }))?.[0]?.["url"];
}

const FILE_LIST_BASE_URL = "https://livingobjects.ebi.ac.uk/bioimaging-01-pub/bia-filelist";
const ARROW_POINTER_SIZE = 4;
const ARROW_ARRAY_BUFFERS_OFFSET = 40;
const ARROW_ARRAY_CHILDREN_OFFSET = 44;
const ARROW_SCHEMA_NAME_OFFSET = 4;
const ARROW_SCHEMA_FORMAT_OFFSET = 0;
const ARROW_SCHEMA_CHILDREN_OFFSET = 32;
const textDecoder = new TextDecoder();

function readPointer(view, offset) {
  return view.getUint32(offset, true);
}

function readInt64AsNumber(view, offset) {
  return Number(view.getBigInt64(offset, true));
}

function readCString(memory, ptr) {
  if (!ptr) return "";

  let end = ptr;
  while (memory[end] !== 0) {
    end += 1;
  }

  return textDecoder.decode(memory.subarray(ptr, end));
}

function getArrowArrayHeader(view, arrayAddr) {
  return {
    length: readInt64AsNumber(view, arrayAddr),
    nullCount: readInt64AsNumber(view, arrayAddr + 8),
    offset: readInt64AsNumber(view, arrayAddr + 16),
    nBuffers: readInt64AsNumber(view, arrayAddr + 24),
    nChildren: readInt64AsNumber(view, arrayAddr + 32),
    buffersPtr: readPointer(view, arrayAddr + ARROW_ARRAY_BUFFERS_OFFSET),
    childrenPtr: readPointer(view, arrayAddr + ARROW_ARRAY_CHILDREN_OFFSET),
  };
}

function getArrowSchemaHeader(view, memory, schemaAddr) {
  return {
    format: readCString(memory, readPointer(view, schemaAddr + ARROW_SCHEMA_FORMAT_OFFSET)),
    name: readCString(memory, readPointer(view, schemaAddr + ARROW_SCHEMA_NAME_OFFSET)),
    nChildren: readInt64AsNumber(view, schemaAddr + 24),
    childrenPtr: readPointer(view, schemaAddr + ARROW_SCHEMA_CHILDREN_OFFSET),
  };
}

function getArrowBufferPointer(view, buffersPtr, index) {
  return readPointer(view, buffersPtr + (index * ARROW_POINTER_SIZE));
}

function isArrowValueValid(view, array, rowIndex) {
  if (array.nullCount <= 0) return true;

  const validityPtr = getArrowBufferPointer(view, array.buffersPtr, 0);
  if (!validityPtr) return true;

  const bitIndex = array.offset + rowIndex;
  const byte = view.getUint8(validityPtr + Math.floor(bitIndex / 8));
  return (byte & (1 << (bitIndex % 8))) !== 0;
}

function makeArrowStringAccessor(view, memory, arrayAddr, schemaAddr) {
  const array = getArrowArrayHeader(view, arrayAddr);
  const schema = getArrowSchemaHeader(view, memory, schemaAddr);
  const offsetByteWidth = schema.format === "U" ? 8 : 4;
  const offsetsPtr = getArrowBufferPointer(view, array.buffersPtr, 1);
  const valuesPtr = getArrowBufferPointer(view, array.buffersPtr, 2);

  return {
    name: schema.name,
    get(rowIndex) {
      if (!isArrowValueValid(view, array, rowIndex) || !offsetsPtr || !valuesPtr) {
        return null;
      }

      const offsetIndex = array.offset + rowIndex;
      const start = offsetByteWidth === 8
        ? readInt64AsNumber(view, offsetsPtr + (offsetIndex * offsetByteWidth))
        : view.getInt32(offsetsPtr + (offsetIndex * offsetByteWidth), true);
      const end = offsetByteWidth === 8
        ? readInt64AsNumber(view, offsetsPtr + ((offsetIndex + 1) * offsetByteWidth))
        : view.getInt32(offsetsPtr + ((offsetIndex + 1) * offsetByteWidth), true);

      return textDecoder.decode(memory.subarray(valuesPtr + start, valuesPtr + end));
    },
  };
}

function getArrowStringColumnsFromRecordBatch(recordBatch, wasmMemory, wasmRecordBatch) {
  const memory = new Uint8Array(wasmMemory.buffer);
  const view = new DataView(wasmMemory.buffer);
  const rootArray = getArrowArrayHeader(view, wasmRecordBatch.arrayAddr());
  const rootSchema = getArrowSchemaHeader(view, memory, wasmRecordBatch.schemaAddr());
  const columns = new Map();

  for (let i = 0; i < rootArray.nChildren && i < rootSchema.nChildren; i += 1) {
    const childArrayAddr = readPointer(view, rootArray.childrenPtr + (i * ARROW_POINTER_SIZE));
    const childSchemaAddr = readPointer(view, rootSchema.childrenPtr + (i * ARROW_POINTER_SIZE));
    const column = makeArrowStringAccessor(view, memory, childArrayAddr, childSchemaAddr);
    columns.set(column.name, column);
  }

  return {
    rowCount: recordBatch.numRows,
    columns,
  };
}

async function* getReadableStreamItems(stream) {
  if (stream?.[Symbol.asyncIterator]) {
    yield* stream;
    return;
  }

  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

function getFirstExistingSchemaColumn(schema, candidateColumns) {
  for (const column of candidateColumns) {
    try {
      if (schema.indexOf(column) >= 0) {
        return column;
      }
    } catch {
      // Keep trying candidates. Parquet schemas differ between generated file lists.
    }
  }

  return null;
}

function addFormatToDatasetSummary(datasetSummaries, datasetName, format) {
  if (!datasetSummaries.has(datasetName)) {
    datasetSummaries.set(datasetName, {
      dataset: datasetName,
      file_count: 0,
      formats: new Map(),
    });
  }

  const summary = datasetSummaries.get(datasetName);
  summary.file_count += 1;
  summary.formats.set(format, (summary.formats.get(format) || 0) + 1);
}

function inferFileFormat({ type, fileName, path, filePath }) {
  const source = String(fileName || path || filePath || "").split(/[?#]/)[0].toLowerCase();
  const multiPartExtensions = [
    ".ome.zarr",
    ".ome.tiff",
    ".ome.tif",
    ".tar.gz",
    ".mrc.gz",
    ".map.gz",
    ".nii.gz",
  ];
  const multiPartExtension = multiPartExtensions.find((extension) => source.endsWith(extension));
  if (multiPartExtension) return multiPartExtension;

  const lastPathPart = source.split("/").pop() || "";
  const extensionIndex = lastPathPart.lastIndexOf(".");
  if (extensionIndex > -1 && extensionIndex < lastPathPart.length - 1) {
    return lastPathPart.slice(extensionIndex);
  }

  const fallbackType = String(type || "").trim();
  return fallbackType || "unknown";
}

function formatDatasetFileSummary(accessionID, parquetUrl, datasetSummaries) {
  const datasets = [...datasetSummaries.values()]
    .map((summary) => ({
      dataset: summary.dataset,
      file_count: summary.file_count,
      formats: Object.fromEntries([...summary.formats.entries()].sort(([a], [b]) => a.localeCompare(b))),
    }))
    .sort((a, b) => a.dataset.localeCompare(b.dataset));

  return {
    accession_id: accessionID,
    source: parquetUrl,
    datasets,
  };
}

export async function buildDatasetFileSummary(accessionID) {

  const parquetUrl = `${FILE_LIST_BASE_URL}/${accessionID}_file_list.parquet`;
  const parquet = await import("parquet-wasm/node");
  const ParquetFile = parquet.ParquetFile || parquet.default?.ParquetFile;
  const wasmMemory = parquet.wasmMemory || parquet.default?.wasmMemory;

  if (!ParquetFile || !wasmMemory) {
    console.warn("parquet-wasm/node did not expose ParquetFile or wasmMemory.");
    return "";
  }

  let parquetFile = null;
  let schema = null;

  try {
    parquetFile = await ParquetFile.fromUrl(parquetUrl);
    schema = parquetFile.schema();

    const datasetColumn = getFirstExistingSchemaColumn(schema, ["dataset", "dataset_title", "study_component", "study_component_title"]);
    const typeColumn = getFirstExistingSchemaColumn(schema, ["format", "file_format", "type"]);
    const fileNameColumn = getFirstExistingSchemaColumn(schema, ["file_name", "filename", "name"]);
    const pathColumn = getFirstExistingSchemaColumn(schema, ["path", "relative_path"]);
    const filePathColumn = getFirstExistingSchemaColumn(schema, ["file_path", "uri", "url"]);
    const columns = [...new Set([datasetColumn, typeColumn, fileNameColumn, pathColumn, filePathColumn].filter(Boolean))];

    if (!datasetColumn || (!fileNameColumn && !pathColumn && !filePathColumn)) {
      console.warn(`Could not find required columns in ${parquetUrl}`);
      return "";
    }

    const datasetSummaries = new Map();
    const stream = await parquetFile.stream({
      columns,
      batchSize: 8192,
      concurrency: 4,
    });

    for await (const recordBatch of getReadableStreamItems(stream)) {
      const wasmRecordBatch = recordBatch.toFFI();
      try {
        const batch = getArrowStringColumnsFromRecordBatch(recordBatch, wasmMemory(), wasmRecordBatch);
        const datasetAccessor = batch.columns.get(datasetColumn);
        const typeAccessor = typeColumn ? batch.columns.get(typeColumn) : null;
        const fileNameAccessor = fileNameColumn ? batch.columns.get(fileNameColumn) : null;
        const pathAccessor = pathColumn ? batch.columns.get(pathColumn) : null;
        const filePathAccessor = filePathColumn ? batch.columns.get(filePathColumn) : null;

        for (let rowIndex = 0; rowIndex < batch.rowCount; rowIndex += 1) {
          const datasetName = datasetAccessor?.get(rowIndex) || "Unknown dataset";
          const format = inferFileFormat({
            type: typeAccessor?.get(rowIndex),
            fileName: fileNameAccessor?.get(rowIndex),
            path: pathAccessor?.get(rowIndex),
            filePath: filePathAccessor?.get(rowIndex),
          });

          addFormatToDatasetSummary(datasetSummaries, datasetName, format);
        }
      } finally {
        wasmRecordBatch.free();
        recordBatch.free();
      }
    }

    return formatDatasetFileSummary(accessionID, parquetUrl, datasetSummaries);
  } catch (error) {
    console.warn(`Failed to summarize EMPIAR parquet file list for ${accessionID}`, error);
    return "";
  } finally {
    schema?.free();
    parquetFile?.free();
  }
}


function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalisePDBAccession(accession) {
  return String(accession ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normaliseEMDBAccession(accession) {
  const digits = String(accession ?? "").match(/\d+/)?.[0];
  return digits || "";
}

function buildEMDBThumbnailURL(emdbNumber) {
  const subDirectory = emdbNumber.length > 4
    ? `${emdbNumber.slice(0, 2)}/${emdbNumber.slice(2, 3)}`
    : emdbNumber.slice(0, 2);
  return `https://www.ebi.ac.uk/emdb/static/em/${subDirectory}/${emdbNumber}/images/400_${emdbNumber}.gif`;
}

function formatEMDBUnits(units) {
  if (!units || units === "Å" || units === "Å") {
    return "&#x212B;";
  }
  return escapeHtml(units);
}

function getEMDBResolution(emdbEntry) {
  const structureDeterminations = asArray(emdbEntry?.structure_determination_list?.structure_determination);

  for (const structureDetermination of structureDeterminations) {
    const imageProcessing = asArray(structureDetermination?.image_processing);
    for (const processing of imageProcessing) {
      const resolution = processing?.final_reconstruction?.resolution;
      if (resolution?.valueOf_) {
        return {
          value: resolution.valueOf_,
          units: formatEMDBUnits(resolution.units),
        };
      }
    }
  }

  return null;
}

function buildRelatedEntryPreviewLink({ accession, href, thumbnailURL, type, measurement }) {
  const safeAccession = escapeHtml(accession);
  const safeType = escapeHtml(type);
  const measurementHtml = measurement
    ? `<span class="bia-related-entry-preview__measurement">${escapeHtml(measurement.label)}: ${escapeHtml(measurement.value)} ${measurement.units}</span>`
    : "";

  return `
    <span class="bia-related-entry">
      <a class="vf-link bia-related-entry__link" href="${href}" target="_blank" rel="noopener noreferrer">${safeAccession}</a>${measurement?.value ? ` (${measurement.value} ${measurement.units})`: ""}
      <span class="bia-related-entry-preview" role="tooltip">
        <img src="${thumbnailURL}" alt="Preview image for ${safeAccession}" loading="lazy" />
        <span class="bia-related-entry-preview__body">
          <span class="bia-related-entry-preview__title">${safeType} ${safeAccession}</span>
          ${measurementHtml}
        </span>
      </span>
    </span>
  `;
}

export async function buildPDBandEMDBLinks(study){
  //|| ["8ay4", "8ay5"]
  const studyPDBLinks = asArray(study?.pdb_accession)
    .map(normalisePDBAccession)
    .filter(Boolean);
  //|| ["15710", "15711"]
  const studyEMDBLinks = asArray(study?.emdb_accession)
    .map(normaliseEMDBAccession)
    .filter(Boolean);

  const pdbLinks = studyPDBLinks.length > 0
    ? studyPDBLinks.map((pdb) => buildRelatedEntryPreviewLink({
      accession: pdb,
      href: `https://www.ebi.ac.uk/pdbe/entry/pdb/${pdb}`,
      thumbnailURL: `https://www.ebi.ac.uk/pdbe/static/entry/${pdb}_deposited_chain_front_image-200x200.png`,
      type: "PDB",
    })).join(", ")
    : null;

  const emdbEntries = await Promise.all(studyEMDBLinks.map(async (emdb) => ({
    accession: emdb,
    metadata: await getFromAPI(`https://www.ebi.ac.uk/emdb/api/entry/EMD-${emdb}`),
  })));

  const emdbLinks = emdbEntries.length > 0
    ? emdbEntries.map(({ accession, metadata }) => {
      const displayAccession = `EMD-${accession}`;
      const resolution = getEMDBResolution(metadata);
      return buildRelatedEntryPreviewLink({
        accession: displayAccession,
        href: `https://www.ebi.ac.uk/emdb/EMD-${accession}`,
        thumbnailURL: buildEMDBThumbnailURL(accession),
        type: "EMDB",
        measurement: resolution ? {
          label: "Resolution",
          value: resolution.value,
          units: resolution.units,
        } : null,
      });
    }).join(", ")
    : null;

  return [pdbLinks, emdbLinks]
}
