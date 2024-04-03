---
title: Submit Annotations
layout: ../layouts/HelpLayout.astro
---
<style>
    figure {
        display: flex;
        flex-direction: row-reverse;
        justify-content: center;
        align-items: center;
    }

    figcaption {
        padding: 0 2rem 0 .5rem;
        text-align: center;
    }
</style>


Submitting Annotations to the BioImage Archive
---------------------------------------

These instructions are for annotations-only submissions, i.e. segmentation masks, point annotations, class labels etc., **without corresponding images.** For example you have created cell segmentations for an already public imaging dataset and you would like to submit the segmentations. For a full list of annotation types and brief descriptions [check here.](/bioimage-archive/aiglossary)

For instructions on general submissions, including those with images *and* annotations, please [click here](/bioimage-archive/submit).

To submit, you'll need to **register an account**, **organise and upload your data**, **prepare a file list**, and then **submit** using our web submission form. These steps are explained in more detail below.

### 1. Register an account

You will need to register for a BioStudies account. You can sign up [here](https://www.ebi.ac.uk/biostudies/submissions/#/signup) and then return to this guide.

### 2. Prepare your data

Now, organise your data for submission. Your data files should be in a single directory tree with a logical hierarchical file structure. Please note that the file paths are not visible on the submission web page, therefore if there is embedded information in the directory structure please put that information as metadata in the file list (see step 4).

Please note that some special characters are not allowed in directory and file names. Stick to the allowed characters listed [here](/bioimage-archive/helpfilelist/#namerules) to avoid any problems with your submission. 

For any program code accompanying your study, it is best to upload that code to a specialised repository (e.g. GitHub or Gitlab), and then add a link to it in your submission, which you will be able to do during the submission process. 

The BioImage Archive implemented MIFA metadata guidelines to further support FAIR sharing. You will need to provide MIFA metadata of your study at the final step of the submission process, using the BIA web submission tool. Please check the more detailed overview of MIFA metadata [here](/bioimage-archive/mifamodelreference).

### 3. Upload your data

We support multiple methods of data upload, each recommended if the submission size falls within one of the following ranges:

| Submission size | Recommended upload method |
| --------------- | ------------------------- |
| If less than 50GB total size and <br/> Less than 20GB per individual file   | [Submission tool upload](https://www.ebi.ac.uk/biostudies/submissions/files)    |
| If up to 1TB total size        | FTP                       |
| If larger than 1TB     | Aspera                    |


The FTP/Aspera tab in the [submission tool upload section](https://www.ebi.ac.uk/biostudies/submissions/files) will include your credentials and upload guidance for these two upload methods.

<figure>
<img src="/src/assets/bioimage-archive/ftp-aspera.png" alt="" class="float-right float-top" style="height: 100px">
<figcaption class="figure-caption"></figcaption>
</figure>

### 4. Prepare your file list

You will need a "table of contents" for your annotation files, called a "File List" in the submission tool. Please use [this template](https://docs.google.com/spreadsheets/d/1yeIp2xZsYSii6WEYpCZvGyCjuYChB0Pd/edit?usp=sharing&ouid=114171845103914552186&rtpof=true&sd=true) for the annotations file list, you can delete the instructions preceded by #. 

In the first column, “Files”, write the path and file name for each annotation file. The annotation type should be one of [these](/bioimage-archive/aiglossary), please get in touch if your annotation does not fit any of the categories. The **Files, annotation type and source image columns are mandatory**, the rest of the columns in this spreadsheet are optional and can be customised to your experiment. You can add extra columns to the file list with any information that is important to understand your annotations.

**Tip:** To automatically create a list of all the files that you have uploaded to your user space, login into your biostudies account and click on the “File Upload” tab. Locate the folder of interest where you uploaded your data, and click on the “Download File List” button to the right (see below). 

This will generate a tsv file with all the paths and file names contained in the folder, that you can now copy and paste into your file list template.

<figure>
<img src="/src/assets/bioimage-archive/filelist_button.png" alt="" class="float-center float-top" style="height: 120px">
<figcaption class="figure-caption"></figcaption>
</figure>

<br>

### 5. Submission
When all annotation files and file lists have been uploaded, you can create your submission [here](https://www.ebi.ac.uk/biostudies/submissions/submissions/new;template=bioimages.mifa). **Make sure you select the BioImage Archive Annotations Submission template** when creating a new submission.

<figure>
<img src="/src/assets/bioimage-archive/BIA_annotation_template_view.png" alt="" class="float-center float-top" style="height: 500px">
<figcaption class="figure-caption"></figcaption>
</figure>

Fill in all the necessary fields in the web forms that will be offered. You can also add sections to your submission if necessary. Please **add a link to the image dataset the annotations belong to, using the Link field of the form**. Make sure that the validation panel on the left indicates "all ok". When that is the case, click on "Submit". 

For detailed guidance on how to fill the submission form, how to add sections and edit your submission, please check the [Submission subsection](https://www.ebi.ac.uk/training/online/courses/bioimage-archive-quick-tour/submitting-data-to-resource-name/submission/) of BIA online tutorial.

After your submission is loaded into the BioImage Archive database, it will be assigned a unique BioImage Archive accession number (i.e., dataset identifier); details on how to access and share your study with others will be available in a confirmation window and will also be sent via e-mail. Your submission will however only be visible to you until its 'Release Date'.

