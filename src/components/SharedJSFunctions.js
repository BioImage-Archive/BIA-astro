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

const EMPIAR_HEADERS_BASE_URL = "https://ftp.ebi.ac.uk/pub/databases/emtest/empiar/headers";

function decodeXmlText(value) {
  return String(value ?? "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function getXmlTagText(xml, tagName) {
  const match = String(xml ?? "").match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? decodeXmlText(match[1]).trim() : "";
}

function getImageSetXmlBlocks(xml) {
  return [...String(xml ?? "").matchAll(/<imageSet(?:\s[^>]*)?>[\s\S]*?<\/imageSet>/gi)].map((match) => match[0]);
}

function buildXmlImageSetSummary(imageSetXml, fallbackDatasetName = "Unknown dataset") {
  const dataset = getXmlTagText(imageSetXml, "name") || fallbackDatasetName;
  const dataFormat = getXmlTagText(imageSetXml, "dataFormat");
  const numImagesOrTiltSeries = Number(getXmlTagText(imageSetXml, "numImagesOrTiltSeries")) || null;
  return {
    dataset,
    data_format: dataFormat,
    file_count: numImagesOrTiltSeries,
  };
}

function getDatasetTitle(dataset, fallbackDatasetName) {
  return typeof dataset === "string" ? dataset : dataset?.title || fallbackDatasetName;
}

function formatDatasetFileSummary(accessionID, xmlUrl, imageSetSummaries, studyDatasets = []) {
  const sourceSummaries = imageSetSummaries.length > 0
    ? imageSetSummaries
    : [buildXmlImageSetSummary("", "Unknown dataset")];
  const summariesByDataset = new Map(sourceSummaries.map((summary) => [summary.dataset, summary]));
  const datasets = studyDatasets.length > 0
    ? studyDatasets.map((dataset, index) => {
        const datasetName = getDatasetTitle(dataset, `Dataset ${index + 1}`);
        const sourceSummary = summariesByDataset.get(datasetName) || sourceSummaries[index] || sourceSummaries[0];
        return {
          ...sourceSummary,
          dataset: datasetName,
        };
      })
    : sourceSummaries;

  const firstSummary = datasets[0] || {};
  return {
    accession_id: accessionID,
    source: xmlUrl,
    data_format: firstSummary.data_format || "",
    file_count: firstSummary.file_count ?? null,
    datasets,
  };
}

export async function buildDatasetFileSummary(accessionID, studyDatasets = []) {
  const empiarEntryId = accessionID.replace("EMPIAR-", "");
  const xmlUrl = `${EMPIAR_HEADERS_BASE_URL}/${empiarEntryId}.xml`;
  try {
    const response = await fetch(xmlUrl);
    if (!response.ok) {
      console.warn(`Failed to fetch EMPIAR XML header for ${accessionID}: ${response.status} ${response.statusText}`);
      return "";
    }

    const xml = await response.text();
    const imageSetSummaries = getImageSetXmlBlocks(xml).map((imageSetXml) => buildXmlImageSetSummary(imageSetXml));
    return formatDatasetFileSummary(accessionID, xmlUrl, imageSetSummaries, studyDatasets);
  } catch (error) {
    console.warn(`Failed to summarize EMPIAR XML header for ${accessionID}`, error);
    return "";
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


export function getHighlightTextString(highlights) {
  if (!highlights) return "";
  const skiphighlightFields = ["title", "organism_classification.common_name", "organism_classification.scientific_name", "imaging_method","imaging_method.keyword","annotation_type.keyword", "accession_id"];
  const highlightValues = Object.entries(highlights).map(([key, value]) => 
    !skiphighlightFields.includes(key) && `<span class="highlight"><b>${`${key.replace(/.*\./g, "").replace(/_/g, " ")}: `}</b><i>${value}</i></span>`).filter(Boolean).flat();
  return highlightValues.join("<br>");
}