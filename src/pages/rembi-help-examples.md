---
title: Study Component Guidance
layout: ../layouts/HelpLayout.astro
---

Study Component Guidance
---------------------------------------

The Study Component explains the context of your image data (and analysed data if applicable). It includes information on the following: 

* Biosample
* Specimen
* Image Acquisition
* Image Correlation (where applicable)
* Image Analysis (where applicable)

Detailed information about what these components are can be found in the [REMBI Lab Guide](/bioimage-archive/rembihelplab) and [REMBI Model Reference](/bioimage-archive/rembimodelreference) documents. 

A submission can contain one or more Study Components. There are different ways to structure your submission into Study Components. Here are five different examples:

#### Example 1

The simplest case is where a single specimen is obtained from a biosample and goes through image acquisition (see Figure 1).  

This Study Component structure may also be used for cases where the biosample and image acquisition parameters are the same but specimen differs from image to image, e.g. high content screening (HCS) type of data. In those cases common properties of the specimen would be put in the submission form and any differences in specimen would be written in the File List.

<figure class="left margin-bottom-large" style="width: 300px">
<img src="/src/assets/bioimage-archive/study_component_ex1.png" alt="Study Component Example 1">
<figcaption class="figure-caption">Figure 1: Study Component Example 1</figcaption>
</figure>

#### Example 2

The second example is where there are multiple specimen obtained from the same biosample, i.e. to which different growth protocols and/or imaging protocols are applied, and then imaged (see Figure 2). A live-cell imaging study of yeast cells, [S-BIAD449](https://www.ebi.ac.uk/biostudies/BioImages/studies/S-BIAD449), is a good example of this case, however please note that it is an older submission so its metadata is not in REMBI format.

<figure class="left margin-bottom-large margin-top-large" style="width: 450px">
<img src="/src/assets/bioimage-archive/study_component_ex2.png" alt="Study Component Example 2">
<figcaption class="figure-caption">Figure 2: Study Component Example 2</figcaption>
</figure>

#### Example 3

The biosample is the same but both the specimen and image acquisition methods are different, resulting in different image data. In these cases splitting the study into more than one study components makes sense. 

[S-BIAD15](https://www.ebi.ac.uk/biostudies/BioImages/studies/S-BIAD15) is a good example for this case, however please note that it is an older submission so its metadata is not in REMBI format.

<figure class="left margin-bottom-large margin-top-large" style="width: 600px">
<img src="/src/assets/bioimage-archive/study_component_ex3.png" alt="Study Component Example 3">
<figcaption class="figure-caption">Figure 3: Study Component Example 3</figcaption>
</figure>

#### Example 4

Different biosample and specimens can also be put into the same study component if the image acquisition method and parameters are the same. One prominent example is if more than one tissue is imaged on the same slide/scan.

<figure class="left margin-bottom-large margin-top-large" style="width: 350px">
<img src="/src/assets/bioimage-archive/study_component_ex4.png" alt="Study Component Example 4">
<figcaption class="figure-caption">Figure 4: Study Component Example 4</figcaption>
</figure>

#### Example 5

This is the case if the same sample is imaged using two different imaging methods or with different image acquisition parameters and then put together for an analysis. 

Correlative studies are perfect examples for this case, e.g. where the same specimen is first imaged using light microscopy, followed by electron microscopy. An example case is [S-BSST429](https://www.ebi.ac.uk/biostudies/bioimages/studies/S-BSST429) where light microscopy images are deposited at the BioImage Archive and 3D electron microscopy data are deposited at the EMPIAR database with links to each other. However please note that this is an older submission, therefore its metadata is not in REMBI format.
You can find more about which archive to use to deposit your correlative datasets [here](/bioimage-archive/helpimagesatebi).

<figure class="left margin-bottom-large margin-top-large" style="width: 350px">
<img src="/src/assets/bioimage-archive/study_component_ex5.png" alt="Study Component Example 5">
<figcaption class="figure-caption">Figure 5: Study Component Example 5</figcaption>
</figure>

