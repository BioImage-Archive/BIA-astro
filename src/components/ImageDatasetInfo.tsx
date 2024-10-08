import preact from 'preact';


function FormatDataset(dataset) {
    //console.log(dataset)
    return (
    <section class="vf-content | embl-grid embl-grid--has-centered-content">
            <div>
                <h3>Dataset</h3>
            </div>
            <div>
                <b>Title</b>: {dataset.title_id}<br/>
                <b>Description:</b> {dataset.description}<br/>
            </div> 
        </section> 
    );
}

export default class ImageDatasetInfo extends preact.Component {
    
    constructor(props) {
        super(props);
    }

    dataset_url = "https://wwwdev.ebi.ac.uk/bioimage-archive/api/v2/experimental_imaging_dataset/" + this.props.uuid
    

    makeRequest(url) { return fetch(url) .then(response => response.json());}



    render() {
        return this.makeRequest(this.dataset_url).then(data => {FormatDataset(data)})
    }
}

