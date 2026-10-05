function formatPhysicalDimension(value, text) {
    if (text === "" && value !== 1) {
        if (value != null) {
            return Number(value).toExponential(1)
        } else {
            return text
        }
    } else {
        if (value != null && value !== 1) {
            return text + " x " + Number(value).toExponential(1)
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
