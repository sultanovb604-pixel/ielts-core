const fs = require('fs');
let code = fs.readFileSync('speaking-avatar.js', 'utf8');

// Set Photo View as default
code = code.replace(/id="examinerVectorView" style="display:flex;"/g, 'id="examinerVectorView" style="display:none;"');
code = code.replace(/id="examinerPhotoView" style="display:none;"/g, 'id="examinerPhotoView" style="display:flex; width:100%; height:100%;"');
code = code.replace(/class="examiner-photo-feed"/g, 'class="examiner-photo-feed" style="width:100%; height:100%; object-fit:cover;"');
// Change background of stage
code = code.replace(/id="zoomConferenceStage" class="zoom-conference-stage"/g, 'id="zoomConferenceStage" class="zoom-conference-stage" style="background:#202124;"');

fs.writeFileSync('speaking-avatar.js', code);
