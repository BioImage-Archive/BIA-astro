---
layout: ../layouts/PoliciesLayout.astro
title: Image archiving at EBI
---
# Image archiving at EBI

## Background

EBI provides archival services for biological images, allowing depositors to submit biological imaging data associated with publications. Three EBI resources, [EMPIAR](https://www.ebi.ac.uk/empiar/), [BioStudies](https://www.ebi.ac.uk/biostudies/) and the [BioImage Archive](https://www.ebi.ac.uk/bioimage-archive/) work together to provide these services. Image data should be deposited into the resource that can provide the most added value related to that deposition. This guidance explains how to ensure you choose the correct resource for your data.

Patient associated medical imaging data cannot currently be deposited into any resource at EBI.

## Spatial-omics data

Spatial-omics represents a comprehensive framework encompassing diverse disciplines such as spatial-transcriptomics, spatial-proteomics, and spatial-metabolomics. Within this framework, spatial data (i.e. images, segmentations etc.) pertinent to each of these domains is centralised within the BioImage Archive, while the corresponding omics data is deposited in relevant omics repositories. These datasets can then be linked to one another ([check here](/bioimage-archive/linkingarchives) for a demo).

For cases where the omics data doesn’t fit into any existing omics repositories, you can submit all data to the BioImage Archive along with the spatial data.

## Image data submission policy



1. EMPIAR accepts raw images underpinning 3D cryo-EM maps and tomograms, 3D images obtained with volume EM techniques, and soft and hard X-ray tomography imaging. Image data in these categories should be deposited into EMPIAR. 
2. All other imaging data associated with a publication should be deposited in the BioImage Archive, using the BioStudies/BioImage Archive shared submission system with an imaging-specific metadata template.
3. For studies that generate both data suitable for EMPIAR and other image data (for example correlative X-ray/light microscopy), datasets should be deposited separately into EMPIAR and the BioImage Archive. Linking information, such as registrations or transformations into common coordinate space, should be deposited in the BioImage Archive.
4. Image data may be moved between the EBI image data resources, according to operational need. Accession identifiers will remain valid.

For queries, please get in touch at [image-presubmission@ebi.ac.uk](mailto:image-presubmission@ebi.ac.uk).


## Examples

This table is intended to provide reference examples showing how different data types are deposited to each archive.


<table>
  <tr>
   <td><strong>Data type</strong>
   </td>
   <td><strong>BioImage Archive</strong>
   </td>
   <td><strong>EMPIAR</strong>
   </td>
   <td><strong>Examples</strong>
   </td>
   <td><strong>Notes</strong>
   </td>
  </tr>
  <tr>
   <td>Light microscopy
   </td>
   <td>✅
   </td>
   <td>❌
   </td>
   <td><a href="https://www.ebi.ac.uk/biostudies/BioImages/studies/S-BIAD287">S-BIAD287</a>,
   <a href="https://www.ebi.ac.uk/biostudies/BioImages/studies/S-BIAD332">S-BIAD332</a>
   </td>
   <td>Including many super-resolution techniques
   </td>
  </tr>
  <tr>
   <td>2D Electron microscopy
   </td>
   <td>✅
   </td>
   <td>❌
   </td>
   <td><a href="https://www.ebi.ac.uk/biostudies/BioImages/studies/S-BIAD217">S-BIAD217</a>, <a href="https://www.ebi.ac.uk/biostudies/BioImages/studies/S-BIAD15">S-BIAD15</a>
   </td>
   <td>Note that 3D (volume) EM data should be deposited to EMPIAR
   </td>
  </tr>
  <tr>
   <td>High content screening images
   </td>
   <td>✅
   </td>
   <td>❌
   </td>
   <td><a href="https://www.ebi.ac.uk/biostudies/BioImages/studies/S-BIAD29">S-BIAD29</a>,
   <a href="https://www.ebi.ac.uk/biostudies/BioImages/studies/S-BIAD235">S-BIAD235</a>
   </td>
   <td>See <strong>1.</strong> below.
   </td>
  </tr>
  <tr>
   <td>Other imaging, e.g. AFM, ultrasound
   </td>
   <td>✅
   </td>
   <td>❌
   </td>
   <td><a href="https://www.ebi.ac.uk/biostudies/BioImages/studies/S-BIAD189">S-BIAD189</a>,
   <a href="https://www.ebi.ac.uk/biostudies/BioImages/studies/S-BIAD194">S-BIAD194</a>
   </td>
   <td>Includes all biological imaging methods not explicitly listed elsewhere
   </td>
  </tr>
  <tr>
   <td>cryo-EM
   </td>
   <td>❌
   </td>
   <td>✅
   </td>
   <td><a href="https://www.ebi.ac.uk/empiar/EMPIAR-10002">EMPIAR-10002</a>, <a href="https://www.ebi.ac.uk/empiar/EMPIAR-10061">EMPIAR-10061</a>
   </td>
   <td>
   </td>
  </tr>
  <tr>
   <td>cryo-ET
   </td>
   <td>❌
   </td>
   <td>(✅)
   </td>
   <td><a href="https://www.ebi.ac.uk/empiar/EMPIAR-10164">EMPIAR-10164</a> , <a href="https://www.ebi.ac.uk/empiar/EMPIAR-10453">EMPIAR-10164</a>
   </td>
   <td>See <strong>2.</strong> below.
   </td>
  </tr>
  <tr>
   <td>Volume EM/XM
   </td>
   <td>❌
   </td>
   <td>✅
   </td>
   <td><a href="https://www.ebi.ac.uk/empiar/EMPIAR-10462">EMPIAR-10462</a> (SBF-SEM), <a href="https://www.ebi.ac.uk/empiar/EMPIAR-10310">EMPIAR-10310</a> (FIB-SEM), <a href="https://www.ebi.ac.uk/empiar/EMPIAR-10087">EMPIAR-10087</a> (SXT)
   </td>
   <td>
   </td>
  </tr>
  <tr>
   <td>Correlative microscopy where one component is 3D EM/XM
   </td>
   <td>✅(Light Microscopy data and correlation info)
   </td>
   <td>✅(EM/XM data)
   </td>
   <td><a href="https://www.ebi.ac.uk/biostudies/BioImages/studies/S-BIAD17">S-BIAD17</a> AND <a href="https://www.ebi.ac.uk/empiar/EMPIAR-10412/">EMPIAR-10412</a>,
   <a href="https://www.ebi.ac.uk/biostudies/BioImages/studies/S-BSST729">S-BSST729</a> AND <a href="https://www.ebi.ac.uk/empiar/EMPIAR-10847/">EMPIAR-10847</a>
   </td>
   <td>See <strong>3.</strong> below
   </td>
  </tr>
  <tr>
   <td>Patient identifiable imaging data
   </td>
   <td>❌
   </td>
   <td>❌
   </td>
   <td>❌
   </td>
   <td>
   </td>
  </tr>
</table>


**1.** For high content screening studies, specific metadata templates are available for different screen types, e.g. compound screens, genetic knockout screens. Please contact us at [bioimage-archive@ebi.ac.uk](mailto:bioimage-archive@ebi.ac.uk) for more information.

**2.** For Cryo-ET, **3D tomograms**: if there are only a small number, they should all be deposited to EMDB. If there are many, then one or a few representative tomograms should be deposited to EMDB; the rest can be deposited to EMPIAR. **Raw data (tilt series**): should only be deposited to EMPIAR.

**3.** For correlative studies:

1. 3D EM or X-ray images should be deposited into EMPIAR.
2. Other modalities (e.g. Light Microscopy) should be deposited into the BioImage Archive.
3. Information that describes the correlation between the images from modalities, e.g. transformations into a shared physical coordinate space, registrations etc. should be deposited into the BioImage Archive.

For more information, see [Iudin et al 2021](https://pubmed.ncbi.nlm.nih.gov/33490973/), though note that where the protocol references deposition to BioStudies, the “BioImaging” template should be used during deposition.
