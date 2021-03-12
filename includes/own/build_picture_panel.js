function buildPicturePanel(div_id, imgfolder, ntrees)
{
	//loads mask files and creates component viewer in given div
	//shows background image for every individual tree (geometry.png)
	//creates divs in according colors (coloring done in main function) with masks for every component
	//these divs have the same ids as the edges -> simultaneously highlighted via css

	//requirements for structure in imgfolder:
	//folders named 0 - n (one for each tree), 
	//in there one geometry file giving the background and id_k.png mask for each component where k corresponds to the segmentationID 
	//given in the alignment (these pictures can be exported from paraview using makeGeometryScreenshots.py and makeMaskScreenshots.py)

	let width = $("#"+div_id).width();

  	$('#'+div_id).append('<ul id="picture-accordion" class="accordionjs"></ul>');
  	for(let t=0; t<ntrees; t++)
  	{
		$('#picture-accordion').append('<li><div>Member '+(t+1)+'</div><div id="imgcontainer_tree_'+t+'" class="imgcontainer"></div></li>');
		$("#imgcontainer_tree_"+t).append('<img id="bg_tree_'+t+'" class="bgimg" src="'+imgfolder+"/"+t+'/geometry.png" />');

		//get all mask files in this folder
		var xmlHttp = new XMLHttpRequest();
		xmlHttp.open( "GET", imgfolder+"/"+t, false ); // false for synchronous request
		xmlHttp.send( null );
		let ret = xmlHttp.responseText;
		let retdom = $.parseHTML(ret);

		var filenames = [];

		$(retdom).find("li > a").each(function(){
				filenames.push(imgfolder + "/"+t+ "/" + $(this).attr("href"));
			 });

		filenames.sort(function(a,b) {
				return (a.substring(a.indexOf("tree")+4, a.indexOf(".json")) - b.substring(b.indexOf("tree")+4, b.indexOf(".json")))
			}); //(a,b)<0 -> a<b

		//load all files starting with "id_"
		let maskopacity = 1.0;
		for (let f=0; f<filenames.length; f++)
		{
			if(filenames[f].substr((imgfolder + "/"+t+ "/").length).startsWith("id_"))
			{
				let id = filenames[f].substring((imgfolder + "/"+t+ "/id_").length, filenames[f].length-4);
				$("#imgcontainer_tree_"+t).append('<div id="tree'+t+'_mask'+id+'" class="mask id_'+id+'"> </div>');
				$("#tree"+t+"_mask"+id).css({
					'-webkit-mask-image': 'url("'+filenames[f]+'")',
					'mask-image': 'url("'+filenames[f]+'")',
					'-webkit-mask-size': $('#bg_tree_'+t).width()+"px "+$('#bg_tree_'+t).height()+"px",
					'mask-size': $('#bg_tree_'+t).width()+"px "+$('#bg_tree_'+t).height()+"px",
					'width': $('#bg_tree_'+t).width()+"px",
					'height': $('#bg_tree_'+t).height()+"px",
					'opacity': maskopacity,
					'position': "absolute",
					'top': '15px',
					// maybe change to 'initial' or 'normal'
					'mix-blend-mode': 'overlay', //'overlay',//'soft-light', //none of the considered options is optimal in all cases (dark/light background). for nice pictures sometimes a change here is required
					'mask-position': '0px 0px'
				});
				$("#tree"+t+"_mask"+id).hide();
			}
		}
  	}

	$("#picture-accordion").accordionjs({closeOther: false});
}