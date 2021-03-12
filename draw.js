require.config({
    paths: {
        d3: 'https://d3js.org/d3.v5.min',
        jQuery: 'https://ajax.googleapis.com/ajax/libs/jquery/3.4.1/jquery.min'
    }
});



function draw(branches, trees, alignment, gAmaxscalar, gAminscalar, freq_w, pers_w, svg, width, height, yshift, layoutStyle) {
    require(['d3'], function (d3) {
    var plateausize = 5;
    var bundledist = 5;
    var minopacity = 0.2;
    var cornerrad = 5;
    var topmargin = 100;

    var svgwidth = parseFloat(svg.style("width"));
    var svgheight = parseFloat(svg.style("height")) - topmargin;// - 200;
    var gEdge_node_info = {};
    var gBundled_edges = [];
    var gEdgeids = [];
    var gBundled_edge_opacities = [];
    var gBundled_beaks = [];
    var gBundled_beakopacities = [];
    var gBundled_beakids = [];
    var gEdge_offsets = [];

    var gGrouped_edges = []

    var gSaddlecnt = new Array(branches.length);
    var gMainsaddle = {};
    var gTrees_edges = new Array(trees.length);
    var gBundled_nodes = [];

    function getyfromscalar(scalar) {
        return svgheight - ((scalar - miniso) / (maxiso - miniso) * svgheight * 0.8 - 0.1 * svgheight) - 100 + topmargin;
    }
    function getscalarfromy(y) {
        return -((y - svgheight + 0.1 * svgheight) / (svgheight * 0.8) * (maxiso - miniso) - miniso);
    }
    function getscalarfrompx(px) {
        return 100 / svgheight * px;
    }
    function existChildBranchSaddlesInRange(pb, rstart, rstop, edgeid = null) {
        //tests if there are saddles from this branch in the given range
        //needed to check if a curve is drawn or the corner is sharp
        for (let b = 0; b < branches.length; b++) {
            if (branches[b].parentBranch == pb) {
                var iso0 = getyfromscalar(branches[b].saddleIsorange[0]);
                var iso1 = getyfromscalar(branches[b].saddleIsorange[1]);
                if (iso0 <= rstop && rstart <= iso1)
                    return true;
            }
        }
        return false;
    }
    function existNodeInRange(b, rstart, rstop, edgeid) {
        for (let t = 0; t < trees.length; t++) {
            for (let n = 0; n < trees[t].nodes.length; n++) {
                if (trees[t].nodes[n].id == branches[b].nodes[branches[b].nodes.length - 1].id) {
                    if (trees[t].nodes[n].y <= rstop && rstart <= trees[t].nodes[n].y)
                        return true;
                }
            }
        }
        return false;
    }
    function getNodeByID(tree, id) {
        if ("frequency" in tree.nodes[0]) { //am in alignment -> id is equal to line number
            if (id < tree.nodes.length)
                return tree.nodes[id];
            else
                return null;
        }
        for (let i = 0; i < tree.nodes.length; i++) {
            if (tree.nodes[i].id == id) {
                return tree.nodes[i];
            }
        }
        return null;
    }
    function getBranchOffsets(branches) {
        let padding_top = 2.0; //in percent of the svg height
        let padding_bottom = 2.0; //in percent of the svg height
        let bboxpuffer = 4; //in px
        let minsaddleheight = 0.01; //in percent of the length of the main branch
        let minavailableheight = 0;

        bboxpuffer = getscalarfrompx(bboxpuffer);
        minsaddleheight = (branches[0].isorange[1] - branches[0].isorange[0]) * minsaddleheight;

        let branchOffsets = [];

        //order branches by depth
        let depth_branch = {};
        let maxdepth = 0;
        for (let b = 0; b < branches.length; b++) {
            if (branches[b].depth in depth_branch)
                depth_branch[branches[b].depth].push(branches[b]);
            else
                depth_branch[branches[b].depth] = [branches[b]];
            if (branches[b].depth > maxdepth)
                maxdepth = branches[b].depth;

            //store id in branches to get rid of the ordering
            branches[b].id = b;
        }
        //start with deeper branches, branches of max depth are not necessary since they dont have children 
        //every depth level from maxdepth to 0 is filled, none can be left out
        for (let depth = maxdepth - 1; depth >= 0; depth--) {
            for (let b = 0; b < depth_branch[depth].length; b++) {
                let curbranch = depth_branch[depth][b];
                let availablerange = [];
                if (curbranch.mode == "up") {
                    if (curbranch.saddleIsorange == null) //main branch
                        availablerange = [curbranch.isorange[0], curbranch.nodeIsorange[0]];
                    else
                        availablerange = [curbranch.saddleIsorange[1], curbranch.nodeIsorange[0]];

                    if (availablerange[1] - availablerange[0] < minavailableheight) {
                        availablerange = [getscalarfromy(curbranch.saddleYmean), curbranch.isorange[1]];
                    }
                }
                else {
                    availablerange = [curbranch.nodeIsorange[1], curbranch.saddleIsorange[0]];
                    if (availablerange[1] - availablerange[0] < minavailableheight) {
                        availablerange = [curbranch.isorange[0], getscalarfromy(curbranch.saddleYmean)];
                    }
                }
                let availableheight = availablerange[1] - availablerange[0];
                availablerange = [availablerange[0] + availableheight * padding_bottom / 100.0, availablerange[1] - availableheight * padding_top / 100.0];
                if (availablerange[1] - availablerange[0] >= minavailableheight) //padding is ignored if the available height gets to small
                    availableheight = availablerange[1] - availablerange[0];
                //find all the children
                let children = [];
                curbranch.children = [];
                for (let c = 0; c < depth_branch[depth + 1].length; c++) {
                    if (depth_branch[depth + 1][c].parentBranch == curbranch.id) {
                        children.push(depth_branch[depth + 1][c]);
                        curbranch.children.push(depth_branch[depth + 1][c].id); //probably this is a nice to have also in previous code. check it out if you have time TODO
                    }
                }
                //building blocks
                let blocks = [];
                let blocksheight = 0;
                //Consider both sides simultaneously
                //Step 1: stack all saddles, ordered by lower saddle coordinate
                //sort the children
                function sortchildren(a, b) {
                    if (a.saddleIsorange[0] > b.saddleIsorange[0])
                        return 1;
                    else if (b.saddleIsorange[0] > a.saddleIsorange[0])
                        return -1;
                    else {
                        if (a.saddleIsorange[1] > b.saddleIsorange[1])
                            return 1;
                        else if (b.saddleIsorange[1] > a.saddleIsorange[1])
                            return -1;
                        else
                            return 0;
                    }
                }
                children.sort(sortchildren);
                for (let c = 0; c < children.length; c++) {
                    //check if the following child is on the other side and overlaps. Then the current child is set to half height
                    let overlapfactor = 1.0;
                    if (c + 1 < children.length && (children[c].x_percent > curbranch.x_percent) != (children[c + 1].x_percent > curbranch.x_percent) && children[c].saddleIsorange[0] < children[c + 1].saddleIsorange[1] && children[c + 1].saddleIsorange[0] < children[c].saddleIsorange[1]) //they overlap
                        overlapfactor = 0.5;
                    if (children[c].x_percent > curbranch.x_percent)
                        blocks.push({ "type": "saddle", "height": Math.max((children[c].saddleIsorange[1] - children[c].saddleIsorange[0]) * overlapfactor, minsaddleheight), "branchid": children[c].id, "side": "right" });
                    else
                        blocks.push({ "type": "saddle", "height": Math.max((children[c].saddleIsorange[1] - children[c].saddleIsorange[0]) * overlapfactor, minsaddleheight), "branchid": children[c].id, "side": "left" });
                    blocksheight += Math.max((children[c].saddleIsorange[1] - children[c].saddleIsorange[0]) * overlapfactor, minsaddleheight);
                }

                //check if the available range is sufficient for all saddles, else no further spaces need to be inserted and overlapping can not be avoided -> squeeze the saddle blocks
                let full = false;
                if (blocksheight > availableheight) {
                    full = true;
                    let sfactor = availableheight / blocksheight;
                    blocksheight = 0;
                    for (let block = 0; block < blocks.length; block++) {
                        blocks[block].height = blocks[block].height * sfactor;
                        blocksheight += blocks[block].height;
                    }
                }
                //Step 2: add space to avoid main-branch overlaps (do currently not consider exact bounding boxes of whole sub-trees but approximate by the bounding box of the main branch (boils down to y values). just hope that the main branch is more or less the complete span)
                //pass throuth blocks from bottom to top (left to right) and add sufficient space for the bounding box on the corresponding side of the tree
                if (!full) {
                    let additionalheight = 0;
                    let block = 0;
                    while (block < blocks.length) {
                        let bboxheight = branches[blocks[block].branchid].isorange[1] - branches[blocks[block].branchid].isorange[0];
                        //get current space 
                        let curspace = blocks[block].height;
                        if (branches[blocks[block].branchid].mode == "up") {
                            let bl2 = block + 1;
                            while (bl2 < blocks.length && blocks[bl2].side != blocks[block].side) {
                                curspace += blocks[bl2].height;
                                bl2++;
                            }
                        } else {
                            let bl2 = block - 1;
                            while (bl2 >= 0 && blocks[bl2].side != blocks[block].side) {
                                curspace += blocks[bl2].height;
                                bl2--;
                            }
                        }
                        if (curspace < bboxheight) {
                            if (branches[blocks[block].branchid].mode == "up") {
                                blocks.splice(block + 1, 0, { "type": "bbox", "height": bboxheight - curspace + bboxpuffer, "side": blocks[block].side });
                                //blocks.splice(block, 0, {"type": "bbox", "height": bboxpuffer, "side":blocks[block].side});
                            }
                            else {
                                //blocks.splice(block+1, 0, {"type": "bbox", "height": bboxpuffer, "side":blocks[block].side});
                                blocks.splice(block, 0, { "type": "bbox", "height": bboxheight - curspace + bboxpuffer, "side": blocks[block].side });
                            }

                            additionalheight += bboxheight - curspace + bboxpuffer;
                            block++;
                        }
                        block++;
                    }

                    full = true;

                    //check if the available range suffices
                    if (blocksheight + additionalheight > availableheight) {
                        full = true;
                        let sfactor = (availableheight - blocksheight) / additionalheight;
                        for (let block = 0; block < blocks.length; block++) {
                            if (blocks[block].type == "bbox") {
                                blocks[block].height = blocks[block].height * sfactor;
                                blocksheight += blocks[block].height;
                            }
                        }
                    } else {
                        blocksheight += additionalheight;
                    }
                }
                //Step 3: if there is still space left, add "free" space according to the space the nodes had before above and below and squeeze again
                if (!full) {
                    let additionalheight = 0;
                    let block = 0;
                    while (block < blocks.length) {
                        if (blocks[block].type == "saddle") {
                            let curchild = branches[blocks[block].branchid];
                            let curparent = branches[curchild.parentBranch];
                            let childtype = null;
                            let minsaddledist = [null, null]; //up and down direction

                            //get upper and lower space for this branch in original tree
                            for (let c = 0; c < children.length; c++) {
                                if (children[c].id == curchild.id)
                                    continue;

                                let other = children[c];

                                if (other.saddleIsorange[1] <= curchild.saddleIsorange[0]) { //other child is below 
                                    if (minsaddledist[1] == null || minsaddledist[1] > curchild.saddleIsorange[1] - other.saddleIsorange[1])
                                        minsaddledist[1] = curchild.saddleIsorange[0] - other.saddleIsorange[1];
                                } else if (other.saddleIsorange[0] >= curchild.saddleIsorange[1]) { //other child is above
                                    if (minsaddledist[0] == null || minsaddledist[0] > other.saddleIsorange[0] - curchild.saddleIsorange[1])
                                        minsaddledist[0] = other.saddleIsorange[0] - curchild.saddleIsorange[1];
                                } else if (other.saddleIsorange[0] < curchild.saddleIsorange[0] && other.saddleIsorange[1] > curchild.saddleIsorange[0]) { //overlap from bottom
                                    minsaddledist[1] = 0;
                                } else if (other.saddleIsorange[1] > curchild.saddleIsorange[1] && other.saddleIsorange[0] < curchild.saddleIsorange[1]) {
                                    //overlap from top
                                    minsaddledist[0] = 0;
                                } else if (other.saddleIsorange[0] < curchild.saddleIsorange[0] && other.saddleIsorange[1] > curchild.saddleIsorange[1]) {
                                    //curchild is contained in the other child
                                    minsaddledist[0] = 0;
                                    minsaddledist[1] = 0;
                                }
                                //if the other child is contained in the current child it is ignored
                                //should not happen that both children are identical tho
                            }
                            if (minsaddledist[0] === null) //no saddles above -> consider top of main branch
                                minsaddledist[0] = branches[0].nodeIsorange[0] - curchild.isorange[1];
                            if (minsaddledist[1] === null) //no saddles below -> consider root
                                minsaddledist[1] = curchild.isorange[0] - branches[0].isorange[0];


                            //get current space above and below
                            let b2 = block - 1;
                            let spacebelow = 0;
                            let spaceabove = 0;
                            while (b2 >= 0 && (blocks[b2].type != "saddle")) {
                                spacebelow += blocks[b2].height;
                                b2--;
                            }
                            b2 = block + 1;
                            while (b2 < blocks.length && (blocks[b2].type != "saddle")) {
                                spaceabove += blocks[b2].height;
                                b2--;
                            }

                            //add missing space above and below
                            if (spaceabove < minsaddledist[0]) {
                                blocks.splice(block + 1, 0, { "type": "free", "height": minsaddledist[0] - spaceabove });
                                additionalheight += minsaddledist[0] - spaceabove;
                            }
                            if (spacebelow < minsaddledist[1]) {
                                blocks.splice(block, 0, { "type": "free", "height": minsaddledist[1] - spacebelow });
                                additionalheight += minsaddledist[1] - spacebelow;
                            }
                            block++;
                        }
                        block++;
                    }

                    //check if the available range suffices
                    if (blocksheight + additionalheight > availableheight) {
                        full = true;
                        let sfactor = (availableheight - blocksheight) / additionalheight;
                        for (let block = 0; block < blocks.length; block++) {
                            if (blocks[block].type == "free") {
                                blocks[block].height = blocks[block].height * sfactor;
                                blocksheight += blocks[block].height;
                            }
                        }
                    }
                    else {
                        blocksheight += additionalheight;
                    }
                }

                //translate blocks in offset coordinates for the children (assumes the needed interval is <= length of available range)
                let filled = 0;
                for (let block = 0; block < blocks.length; block++) {
                    if (filled > availableheight) {
                        console.log(blocks);
                        throw new Error("blocks are too large for available height " + availableheight + ". filled up to " + filled)
                    }
                    if (blocks[block].type == "saddle") {
                        let curcoord = getyfromscalar(branches[blocks[block].branchid].saddleIsorange[0]); //unshifted lower coordinate of the saddle
                        let newcoord = getyfromscalar(availablerange[0] + filled);
                        branchOffsets[blocks[block].branchid] = newcoord - curcoord;
                    }
                    filled += blocks[block].height
                }
            }
        }
        branchOffsets[0] = 0; //no offset for main branch

        //add parents offset to children
        //its ok to go by the order of branches, there is always the parent branch first, then children
        for (let b = 0; b < branches.length; b++) {
            if (!('children' in branches[b])) //nodes of max depth didnt get children entry yet
                branches[b].children = [];
            for (let c = 0; c < branches[b].children.length; c++) {
                branchOffsets[branches[b].children[c]] += branchOffsets[b];
            }
        }
        return branchOffsets;
    }

    if (svg.size() != 0) {
        svg.selectAll('*').remove();
        //clear the data that depends on the weights
        gEdgeids = [];
        gGrouped_edges = [];
        gBundled_nodes = [];
        gBundled_edges = [];
        gBundled_edge_opacities = [];
        gBundled_beaks = []; //background shapes
        gBundled_beakopacities = []; //and their opacities
        gBundled_beakids = []; //and their ids
        gEdge_offsets = {};
        gEdge_node_info = {};
    }

    var miniso = alignment.nodes[0].scalar;
    var maxiso = alignment.nodes[0].scalar;
        for (let n = 1; n < alignment.nodes.length; n++) {
        if (alignment.nodes[n].frequency == 0)
            continue;
        if (miniso > alignment.nodes[n].scalar)
            miniso = alignment.nodes[n].scalar;
        if (maxiso < alignment.nodes[n].scalar)
            maxiso = alignment.nodes[n].scalar;
    }

    /*miniso = branches[0].isorange[0];
    maxiso = branches[0].isorange[1];
    for (let b = 1; b < branches.length; b++) {
        if (branches[b].isorange[0] < miniso)
            miniso = branches[b].isorange[0];
        if (branches[b].isorange[1] > maxiso)
            maxiso = branches[b].isorange[1];
    }*/

    console.log('miniso: ', miniso)
    console.log('maxiso: ', maxiso)

    for (let b = 0; b < branches.length; b++) {
        if (branches[b].nodes == null) {
            console.log("branch nodes ", b, " is null!");
            continue;
        }
        for (let n = 0; n < branches[b].nodes.length; n++) {
            if (n === 0 && branches[b].parentBranch >= 0)
                branches[b].nodes[n].x = branches[branches[b].parentBranch].x_percent / 100 * svgwidth * 0.8 + svgwidth * 0.1;
            else
                branches[b].nodes[n].x = branches[b].x_percent / 100 * svgwidth * 0.8 + svgwidth * 0.1;
            branches[b].nodes[n].y = getyfromscalar(branches[b].nodes[n].scalar);

            //set x and y values also for nodes in alignment
            alignment.nodes[branches[b].nodes[n].id].x = branches[b].nodes[n].x
            alignment.nodes[branches[b].nodes[n].id].y = branches[b].nodes[n].y

            if (!("depth" in branches[b].nodes[n]))
                branches[b].nodes[n].depth = branches[b].depth;
            //console.log(branches[b].nodes[n].x, branches[b].nodes[n].y)
        }
        if (branches[b].nodes.length > 0)
            branches[b].x = branches[b].nodes[0].x;
    }

    // set x and y coordinates in trees; x according to coords in alignment and y from own scalar
    for (let t = 0; t < trees.length; t++) {
        for (let n = 0; n < trees[t].nodes.length; n++) {
            //var an = alignment.nodes[trees[t].nodes[n].id];
            //var tn = trees[t].nodes[n];
            //console.log(alignment.nodes[trees[t].nodes[n].id].x);
            trees[t].nodes[n].x = alignment.nodes[trees[t].nodes[n].id].x;
            trees[t].nodes[n].y = getyfromscalar(trees[t].nodes[n].scalar);
            trees[t].nodes[n].depth = alignment.nodes[trees[t].nodes[n].id].depth;
            if ("root_id" in alignment.nodes[trees[t].nodes[n].id])
                trees[t].nodes[n].root_id = alignment.nodes[trees[t].nodes[n].id].root_id;
            //console.log(trees[t].nodes[n].x, trees[t].nodes[n].y)
        }
    }


    // get nodes for drawing
    var minNodeDistPx = 1;

    for (let t = 0; t < trees.length; t++) {
        for (let n = 0; n < trees[t].nodes.length; n++) {
            if (trees[t].nodes[n].upEdgeIDs.length + trees[t].nodes[n].downEdgeIDs.length == 1) {
                if (!("fixed" in alignment.nodes[trees[t].nodes[n].id])) {
                    console.log("node " + n + " of tree " + t + " is not contained in the branch decomposition")
                    continue;
                }

                var doublenode = false;
                for (let n2 = 0; n2 < gBundled_nodes.length; n2++) {
                    if (Math.abs(gBundled_nodes[n2].x - trees[t].nodes[n].x) <= minNodeDistPx &&
                        Math.abs(gBundled_nodes[n2].y - trees[t].nodes[n].y) <= minNodeDistPx)
                        doublenode = true;
                }
                if (!doublenode) {
                    gBundled_nodes.push(trees[t].nodes[n]);
                }
            }
        }
    }

    for (let b = 0; b < branches.length; b++) { //add edges based on branches to know which branch they belong to
        //go by branches -> parent branches are treated before children
        var edgeid = branches[b].nodes[branches[b].nodes.length - 1].id;

        var an1 = branches[b].nodes[0];
        var an2 = branches[b].nodes[branches[b].nodes.length - 1];

        var maxedge = null; //are filled with the edge from max saddle to bundle and min saddle
        var minedge = null;

        if (an1.depth > an2.depth) {
            let tmp = an1;
            an1 = an2;
            an2 = tmp;
        }
        var gRootbranchid = null;
        var gRootid = null;
        if (an1.y != an2.y && (an1.x != an2.x || "isLonely" in branches[b])) {
            var leafYmean = getyfromscalar(branches[b].leafMean);
            var saddleYmean = getyfromscalar(branches[b].saddleMean);
            var saddles = branches[b].saddles;
            var leaves = branches[b].leaves;
            var leafminy = getyfromscalar(branches[b].leafmins);
            var leafmaxy = getyfromscalar(branches[b].leafmaxs);
            var strees = branches[b].strees;

            //set x and y coords for saddles and leaves(not linked here)
            for (let s = 0; s < saddles.length; s++) {
                saddles[s].x = alignment.nodes[saddles[s].id].x;
                saddles[s].y = getyfromscalar(saddles[s].scalar);
            }
            for (let l = 0; l < leaves.length; l++) {
                leaves[l].x = alignment.nodes[leaves[l].id].x;
                leaves[l].y = getyfromscalar(leaves[l].scalar);
            }
            /*for (let l = 0; l < leaves.length; l++) {
                leaves[l].y = getyfromscalar(leaves[l].scalar);
            }*/
            

            branches[b].saddleYmean = saddleYmean;

            if (saddles.length == null)
                continue;

            var crnrad = cornerrad;
            if (an1.y > an2.y) {
                if (existChildBranchSaddlesInRange(b, saddleYmean - (2.5 * cornerrad), saddleYmean, edgeid) || existNodeInRange(b, saddleYmean - (2.5 * cornerrad), saddleYmean, edgeid))
                    crnrad = 0;
            }
            else {
                if (existChildBranchSaddlesInRange(b, saddleYmean, saddleYmean + (2.5 * cornerrad), edgeid) || existNodeInRange(b, saddleYmean, saddleYmean + (2.5 * cornerrad), edgeid))
                    crnrad = 0;
            }

            var oldx = 0;
            if ("isLonely" in branches[b]) {
                for (let s = 0; s < saddles.length; s++) {
                    oldx = saddles[s].x;
                    saddles[s].x = branches[branches[b].parentBranch].x; // edge starts at grandparent
                    // now move with plateausize right/left
                    if (oldx < saddles[s].x)
                        saddles[s].x = saddles[s].x - plateausize;
                    else if (oldx > saddles[s].x)
                        saddles[s].x = saddles[s].x + plateausize;
                }
            }

            //get meet point for the bundle (special when the x-values of connected saddles vary)
            var bundle_meet_point = []; //x and y coordinate where all bundle edges will meet and the long edges start
            var closestSaddle = saddles[0];
            var closestSaddleDist = Math.abs(leaves[0].x - saddles[0].x);
            var saddleSide = null;
            if (leaves[0].x < saddles[0].x)
                saddleSide = 'right';
            else
                saddleSide = 'left';
            var saddlemaxisos = [saddles[0].scalar]; //needed for drawing of beak and edgy and lonely children checking of bundle
            var saddleminisos = [saddles[0].scalar];
            var saddleXvalues = [saddles[0].x];
            var saddleXcnt = [1]; //count how often each saddle occurs

            for (let s = 1; s < saddles.length; s++) {

                if (saddleXvalues.indexOf(saddles[s].x) == -1) {
                    saddleXvalues.push(saddles[s].x);
                    saddleXcnt.push(1);
                    saddlemaxisos.push(saddles[s].scalar);
                    saddleminisos.push(saddles[s].scalar);

                    if (closestSaddleDist > Math.abs(leaves[0].x - saddles[s].x)) {
                        closestSaddleDist = Math.abs(leaves[0].x - saddles[s].x);
                        closestSaddle = saddles[s];
                    }
                    if (leaves[0].x < saddles[s].x) {
                        if (saddleSide != 'right')
                            saddleSide = 'mixed';
                    }
                    else {
                        if (saddleSide != 'left')
                            saddleSide = 'mixed';
                    }
                }
                else {  //update saddlemaxisos and minisos
                    var c = 0;
                    while (c < saddleXvalues.length && saddleXvalues[c] != saddles[s].x)
                        c++;
                    if (c == saddleXvalues.length)
                        throw new Error("could not find current saddle in saddleXvalues");

                    saddleXcnt[c] += 1;

                    if (saddlemaxisos[c] < saddles[s].scalar)
                        saddlemaxisos[c] = saddles[s].scalar;
                    if (saddleminisos[c] > saddles[s].scalar)
                        saddleminisos[c] = saddles[s].scalar;
                }
            }

            // get main saddle and the number of saddles for coloring of multisaddles
            gSaddlecnt[b] = saddleXvalues.length;
            gMainsaddle[edgeid] = 0;
            if (saddleXvalues.length > 1) {
                gMainsaddle[edgeid] = saddleXcnt.indexOf(Math.max.apply(null, saddleXcnt));
            }
            // get opacity from the count of the gMainsaddle
            var frequencyPercent = saddleXcnt[gMainsaddle[edgeid]] / trees.length * 100.0;
            var persistencePercent = Math.abs(an1.scalar - an2.scalar) * 100.0 / Math.abs(gAmaxscalar - gAminscalar);
            var branch_opacity = Math.max(minopacity, (persistencePercent * pers_w + frequencyPercent * freq_w) / 100.0);

            if (saddleSide != 'mixed') { // all saddles are on the same side of the considered leaves                
                if (saddleSide == 'right') // start is right of endpoint
                    bundle_meet_point = [closestSaddle.x - (bundledist + plateausize) * 1.1, saddleYmean];
                else {
                    bundle_meet_point = [closestSaddle.x + (bundledist + plateausize) * 1.1, saddleYmean];
                }
            }
            else { // check if meetpoint should be up/down/at horizontal edge
                var leafSide = null;
                if (leaves[0].y > saddleYmean)
                    leafSide = "below";
                else
                    leafSide = "above";

                for (let l = 1; l < leaves.length; l++) {
                    if (leaves[l].y > saddleYmean) {
                        if (leafSide != "below") {
                            leafSide = "mixed";
                            break;
                        }
                    }
                    else {
                        if (leafSide != "above") {
                            leafSide = "mixed";
                            break;
                        }
                    }
                }
                if (leafSide == "above")
                    bundle_meet_point = [leaves[0].x, saddleYmean - bundledist];
                else if (leafSide == "below")
                    bundle_meet_point = [leaves[0].x, saddleYmean + bundledist];
                else
                    bundle_meet_point = [leaves[0].x, saddleYmean];
            }

            var saddlesDrawn = new Array(saddleXvalues.length).fill(0); //makes sure that there max 2 edges drawn per saddle (min and max might not be unique)
            var createBeak = true;

            for (let l = 0; l < leaves.length; l++) {
                var bundled_edge_firstpart = null;
                var bundled_edge_secondpart = null; //is created for all branches to enable animation, but only one is shown
                var grouped_edge_firstpart = null;
                var grouped_edge_secondpart = null;
                var tn1 = saddles[l];
                var tn2 = leaves[l];

                //let parentbranch = parentbranches[l];
                //get opacity in the leaf node 
                leaves[l].opacity = branch_opacity; // todo: leaves[l] or l(original)?
                //find number of the current saddle. stays null if just one origin for this branch
                var saddleNr = null;
                if (saddleXvalues.length > 1) {
                    saddleNr = 0;
                    while (saddleNr < saddleXvalues.length && saddleXvalues[saddleNr] != tn1.x)
                        saddleNr++;
                }
                if (typeof gTrees_edges[strees[l]] === 'undefined') {
                    if (saddleNr !== null)
                        gTrees_edges[strees[l]] = ["id_" + edgeid + "_" + saddleNr];
                    else
                        gTrees_edges[strees[l]] = ["id_" + edgeid + "_"];
                }
                else {
                    if (saddleNr !== null)
                        gTrees_edges[strees[l]].push("id_" + edgeid + "_" + saddleNr);
                    else
                        gTrees_edges[strees[l]].push("id_" + edgeid + "_");
                }

                let eid = gTrees_edges[strees[l]][gTrees_edges[strees[l]].length - 1];
                if (typeof gEdge_node_info[eid] === 'undefined')
                    gEdge_node_info[eid] = {};
                gEdge_node_info[eid][strees[l]] = [saddles[l], leaves[l]];

                if (tn1.x > tn2.x) { //start is right of end point
                    if (saddleYmean > tn2.y) { // [4] start below end
                        if (tn1) {
                            if (bundle_meet_point[0] < an2.x + crnrad)
                                bundle_meet_point[0] = an2.x + crnrad;
                            bundled_edge_firstpart = [[tn1.x, tn1.y], [tn1.x - plateausize * 0.5, tn1.y], [tn1.x - plateausize, tn1.y], [tn1.x - (bundledist + plateausize), saddleYmean], bundle_meet_point];
                            bundled_edge_secondpart = [bundle_meet_point, [an2.x + crnrad, bundle_meet_point[1]], [an2.x, bundle_meet_point[1] - crnrad]];
                            grouped_edge_firstpart = [[tn1.x, tn1.y], [bundle_meet_point[0], tn1.y]];
                            grouped_edge_secondpart = [[bundle_meet_point[0], tn1.y], [tn2.x + crnrad, tn1.y], [tn2.x, tn1.y - crnrad], [tn2.x, tn2.y]];
                        }
                    }
                    else { // [3] start above end
                        if (tn1) {
                            if (bundle_meet_point[0] < an2.x + crnrad)
                                bundle_meet_point[0] = an2.x + crnrad;
                            bundled_edge_firstpart = [[tn1.x, tn1.y], [tn1.x - 0.5 * plateausize, tn1.y], [tn1.x - plateausize, tn1.y], [tn1.x - (bundledist + plateausize), saddleYmean], bundle_meet_point];
                            bundled_edge_secondpart = [bundle_meet_point, [an2.x + crnrad, bundle_meet_point[1]], [an2.x, bundle_meet_point[1] + crnrad]];
                            grouped_edge_firstpart = [[tn1.x, tn1.y], [bundle_meet_point[0], tn1.y]];
                            grouped_edge_secondpart = [[bundle_meet_point[0], tn1.y], [tn2.x + crnrad, tn1.y], [tn2.x, tn1.y + crnrad], [tn2.x, tn2.y]];
                        }
                    }
                } else {
                    if (saddleYmean > tn2.y) {
                        if (tn1) {
                            if (bundle_meet_point[0] > an2.x - crnrad)
                                bundle_meet_point[0] = an2.x - crnrad;
                            bundled_edge_firstpart = [[tn1.x, tn1.y], [tn1.x + 0.5 * plateausize, tn1.y], [tn1.x + plateausize, tn1.y], [tn1.x + (bundledist + plateausize), saddleYmean], bundle_meet_point];
                            bundled_edge_secondpart = [bundle_meet_point, [an2.x - crnrad, bundle_meet_point[1]], [an2.x, bundle_meet_point[1] - crnrad]];
                            grouped_edge_firstpart = [[tn1.x, tn1.y], [bundle_meet_point[0], tn1.y]];
                            grouped_edge_secondpart = [[bundle_meet_point[0], tn1.y], [tn2.x - crnrad, tn1.y], [tn2.x, tn1.y - crnrad], [tn2.x, tn2.y]];
                        }
                    }
                    else { // [2] start above end
                        if (tn1) {
                            if (bundle_meet_point[0] > an2.x - crnrad)
                                bundle_meet_point[0] = an2.x - crnrad;
                            bundled_edge_firstpart = [[tn1.x, tn1.y], [tn1.x + 0.5 * plateausize, tn1.y], [tn1.x + plateausize, tn1.y], [tn1.x + (bundledist + plateausize), saddleYmean], bundle_meet_point];
                            bundled_edge_secondpart = [bundle_meet_point, [an2.x - crnrad, bundle_meet_point[1]], [an2.x, bundle_meet_point[1] + crnrad]];
                            grouped_edge_firstpart = [[tn1.x, tn1.y], [bundle_meet_point[0], tn1.y]];
                            grouped_edge_secondpart = [[bundle_meet_point[0], tn1.y], [tn2.x - crnrad, tn1.y], [tn2.x, tn1.y + crnrad], [tn2.x, tn2.y]];
                        }
                    }
                }

                if (tn2 && bundled_edge_firstpart !== null) {
                    if (branches[b].mode == "up")
                        bundled_edge_secondpart.push([an2.x, leafmaxy]);
                    else
                        bundled_edge_secondpart.push([an2.x, leafminy]);
                    let increasing = false;
                    if (bundled_edge_firstpart[0][0] < bundled_edge_firstpart[bundled_edge_firstpart.length - 1][0])
                        increasing = true;
                    let redo = true;
                    while (redo) {
                        redo = false;
                        for (let ee = 1; ee < bundled_edge_firstpart.length; ee++) {
                            if (increasing && bundled_edge_firstpart[ee - 1][0] > bundled_edge_firstpart[ee][0]) {
                                redo = true;
                                bundled_edge_firstpart.splice(ee, 1);
                            }
                            else if (!increasing && bundled_edge_firstpart[ee - 1][0] < bundled_edge_firstpart[ee][0]) {
                                redo = true;
                                bundled_edge_firstpart.splice(ee - 1, 1);
                            }
                        }
                    }
                    gBundled_edges.push(bundled_edge_firstpart);
                    gEdgeids.push([edgeid, saddleNr]);

                    gBundled_edges.push(bundled_edge_secondpart);
                    gEdgeids.push([edgeid, null]);

                    gGrouped_edges.push(grouped_edge_firstpart);
                    gGrouped_edges.push(grouped_edge_secondpart);

                    if (saddleXvalues.length == 1) {
                        if (saddlesDrawn[0] < 2 && (tn1.scalar == saddlemaxisos[0] || tn1.scalar == saddleminisos[0])) {
                            gBundled_edge_opacities.push(branch_opacity);
                            saddlesDrawn[0] += 1;
                        }
                        else //between edges are not shown
                            gBundled_edge_opacities.push(0);

                        if (tn1.scalar == saddlemaxisos[0]) //needed for beaks which are only drawn if non-varying saddles
                            maxedge = bundled_edge_firstpart.slice();
                        if (tn1.scalar == saddleminisos[0])
                            minedge = bundled_edge_firstpart.slice();
                    } else {
                        //check which saddlevalue is the current one
                        c = 0;
                        while (c < saddleXvalues.length && tn1.x != saddleXvalues[c])
                            c++;
                        if (c == saddleXvalues.length) {
                            console.log("saddleXvalues: ");
                            console.log(saddleXvalues);
                            throw new Error("could not find saddle x value " + tn1.x + " in saddleXvalues");
                        }
                        if (saddlesDrawn[c] < 2 && (tn1.scalar == saddlemaxisos[c] || tn1.scalar == saddleminisos[c])) {
                            gBundled_edge_opacities.push(branch_opacity);
                            saddlesDrawn[c] += 1;
                        } else //between edges are not
                            gBundled_edge_opacities.push(0);
                    }
                    if (tn2.scalar == branches[b].nodeIsorange[1]) //show the long edge going to the uppermost/lowermost point
                        gBundled_edge_opacities.push(branch_opacity);
                    else //all other long edges are not
                        gBundled_edge_opacities.push(0);
                }
            }

            if (createBeak) { //no beaks if varying saddle x-values or extended edges
                if (maxedge.length == 5 && minedge.length == 5) { //sanity check has deleted from edge. god knows what happened -> no beak for this
                    gBundled_beaks.push([maxedge[0], maxedge[1], maxedge[2], maxedge[3], maxedge[4], minedge[4], minedge[3], minedge[2], minedge[1], minedge[0]]);
                    gBundled_beakopacities.push(branch_opacity);
                    gBundled_beakids.push(edgeid);
                }
            }
        } else {
            gRootbranchid = edgeid;
            gRootid = branches[b].nodes[0].id;

            gBundled_edges.push([[an1.x, getyfromscalar(branches[b].isorange[0])], [an2.x, getyfromscalar(branches[b].isorange[1])]]);
            gEdgeids.push([edgeid, null]); // assign id of final leaf of branch to all edges

            gGrouped_edges.push([[an1.x, getyfromscalar(branches[b].isorange[0])], [an2.x, getyfromscalar(branches[b].isorange[1])]]);

            gEdge_offsets[an1.id] = 0; // no offset for main branch
            gEdge_offsets[an2.id] = 0;

            gSaddlecnt[b] = 1;
            gMainsaddle[edgeid] = 0;

            let freq = 0;

            for (let t = 0; t < trees.length; t++) {
                let tln = getNodeByID(trees[t], an2.id);
                if (tln === null)
                    continue;

                let tsn = getNodeByID(trees[t], an1.id);
                if (tsn === null)
                    continue;

                freq++; // main branch has only one origin, hence counting the number of branches that have both leaves is sufficient

                if (typeof gEdge_node_info["id_" + edgeid + "_"] === 'undefined')
                    gEdge_node_info["id_" + edgeid + "_"] = {};
                gEdge_node_info["id_" + edgeid + "_"][t] = [tsn, tln];

                if (typeof gTrees_edges[t] === 'undefined')
                    gTrees_edges[t] = ["id_" + edgeid + "_"];
                else
                    gTrees_edges[t].push(["id_" + edgeid + "_"]);
            }
            let frequencyPercent = freq / trees.length * 100.0;
            let persistencePercent = Math.abs(an1.scalar - an2.scalar) * 100.0 / Math.abs(gAmaxscalar - gAminscalar);

            let branch_opacity = Math.max(minopacity, (persistencePercent * pers_w + frequencyPercent * freq_w) / 100.0);

            gBundled_edge_opacities.push(branch_opacity);

            for (let t = 0; t < trees.length; t++) {
                let tln = getNodeByID(trees[t], an2.id);
                if (tln === null)
                    continue;

                let tsn = getNodeByID(trees[t], an1.id);
                if (tsn === null)
                    continue;

                tln.opacity = branch_opacity;
                tsn.opacity = branch_opacity;
            }
        }
        var branchOffsets = getBranchOffsets(branches);

        for (let b = 0; b < branches.length; b++) {
            let edgeid = branches[b].nodes[branches[b].nodes.length - 1].id;
            gEdge_offsets[edgeid] = branchOffsets[b];
        }
    }


    var gEdgewidth = 3;
    var gNodewidth = 3;
    //let linearLineGenerator = d3.line().curve(d3.linear);
    let lineGenerator = function (data, edgeid) {
        let generator = d3.line()
            .x(function (d) { return d[0]; })
            .y(function (d) {
                if (yshift)
                    return d[1] + gEdge_offsets[edgeid];
                else
                    return d[1];
            })
            .curve(d3.curveMonotoneX);

        return generator(data);
    };

    let curLineGenerator = lineGenerator;
    var layout = 'bundle';
    if (layoutStyle == 'grouped') {
        layout = 'grouped'
    }

    if (layout == 'grouped') {
        svg.selectAll("edge_alignment")
            .data(gGrouped_edges)
            .enter()
            .append("path")
            .attr('d', function (d, i) { return curLineGenerator(d, gEdgeids[i][0]); })
            .attr("stroke-width", gEdgewidth)
            .attr('fill', 'none')
            .attr("class", "edge")
            .classed("edge_alignment", true)
            .attr("opacity", 0.5)

            .attr("id", function (d, i) { if (gEdgeids[i][1] === null) return "id_" + gEdgeids[i][0] + "_"; else return "id_" + gEdgeids[i][0] + "_" + gEdgeids[i][1]; })
            .classed("downlight_edge", true)
            .classed("visible", true);

        svg.selectAll("node_alignment")
            .data(gBundled_nodes)
            .enter()
            .append("circle")
            .attr("cx", function (d) { return (d.x); })
            .attr("cy",
                function (d) {
                    if (yshift)
                        return (d.y + gEdge_offsets[d.id]);
                    else
                        return (d.y);
                })
            .attr("r", gNodewidth)
            //.style("fill", function(d) {return color(d.id);})
            .attr("class", "node")
            .classed("node_alignment", true)
            .attr("id", function (d) {
                if (!("root_id" in d))
                    return "id_" + d.id + "_";
                else
                    return "id_" + d.root_id + "_";
            });
    } else if (layout == 'bundle') {
        svg.selectAll("beak")
            .data(gBundled_beaks)
            .enter()
            .append("path")
            .attr('d', function (d, i) { return curLineGenerator(d, gBundled_beakids[i]); })
            .attr("stroke-width", 0)
            .attr('fill', "#B8B8B8")
            .attr("class", "beak")
            .attr("opacity", function (d, i) { return gBundled_beakopacities[i]; })
            .attr("id", function (d, i) { return "id_" + gBundled_beakids[i] + "_"; })
            .classed("downlight_edge", true);

        svg.selectAll("edge_alignment")
            .data(gBundled_edges)
            .enter()
            .append("path")
            .attr('d', function (d, i) { return curLineGenerator(d, gEdgeids[i][0]); })
            //.attr("stroke-width", function(d,i){return Math.ceil(gBundled_edge_opacities[i]*5);})
            .attr("stroke-width", function (d, i) { if (gBundled_edge_opacities[i] > 0) return gEdgewidth; else return 1; })
            .attr('fill', 'none')
            .attr("class", "edge")
            .classed("edge_alignment", true)
            .attr("opacity", function (d, i) { return gBundled_edge_opacities[i]; })
            .attr("id", function (d, i) { if (gEdgeids[i][1] === null) return "id_" + gEdgeids[i][0] + "_"; else return "id_" + gEdgeids[i][0] + "_" + gEdgeids[i][1]; })
            .classed("visible", function (d, i) { return gBundled_edge_opacities[i] > 0; }) //classed visible if opacity was set > 0 to not highlight the others
            .classed("downlight_edge", true);

        svg.selectAll("node_alignment")
            .data(gBundled_nodes)
            .enter()
            .append("circle")
            .attr("cx",
                function (d) {
                    return (d.x);
                })
            .attr("cy",
                function (d, i) {
                    if (yshift)
                        return (d.y + gEdge_offsets[d.id]);
                    else
                        return (d.y);
                })
            .attr("r", gNodewidth)
            .attr("class", "node")
            .classed("node_alignment", true)
            .attr("id", function (d) {
                if (!("root_id" in d))
                    return "id_" + d.id + "_";
                else
                    return "id_" + d.root_id + "_";
            })
            .attr("opacity", function (d) { return (d.opacity); });
    }


    

    function buildMatrix(trees, trees_edges) {
        var blocksize = 37;
        svg.append('svg')
            .attr("width", width)
            .attr("height", blocksize)
            .attr("id", "matrixsvg");

        var treedata = []; //row, col, treeid, leafids
        var n = Math.floor(width / blocksize);
        for (let t = 0; t < trees.length; t++) {
            treedata.push([Math.floor(t / n), t % n, t + 1, trees_edges[t]]);
        }
        let domain = Array.from(Array(n).keys());

        let x = d3.scaleBand()
            .range([0, width])
            .domain(domain)
            .padding(0.01);

        //Draw
        svg.selectAll("rect")
            .data(treedata)
            .enter()
            .append("rect")
            .attr("x", function (d) { return x(d[1]); })
            .attr("y", function (d) { return x(d[0]); })
            .attr("width", x.bandwidth())
            .attr("height", x.bandwidth())
            .attr("class", function (d) { return d[3].join(" "); })
            .classed("tree_rect", true)
            .classed("tree_rect_downlight", true)
            .classed("tree_box", true)
            .attr("id", function (d) { return "tree_rect_" + d[2]; });

        svg.selectAll("recttext")
            .data(treedata)
            .enter()
            .append("text")
            .attr("x", function (d) { return x(d[1]) + x.bandwidth() * 0.5; })
            .attr("y", function (d) { return x(d[0]) + x.bandwidth() * 0.5; })
            .text(function (d) { return d[2] })
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "central")
            .attr("font-family", "sans-serif")
            .attr("font-size", "20px")
            .attr('color', 'black')
            .attr("class", function (d) { return d[3].join(" "); })
            .classed("tree_text", true)
            .classed("tree_text_downlight", true)
            .classed("tree_box", true)
            .attr("id", function (d) { return "tree_text_" + d[2]; });
    }

    buildMatrix(trees, gTrees_edges)

    var gSelectedNodes = [];
    var singlestyleblock = null;
    var singlestyleblockopacity = null;
    var gEdgeidColor = {};


    let highlightfct = function (id, opacity = 1.0) {
        //console.log("highlight " + id);
        //let splitid = id.split('_');

        if (gSelectedNodes.indexOf(id) == -1) { //is not selected

            d3.selectAll(".node[id^=" + id + "]").classed("downlight", false)
                .classed("highlight", true);
            d3.selectAll(".edge[id^=" + id + "]").classed("downlight_edge", false)
                .classed("highlight", true);
        }
        if (singlestyleblock !== null)
            singlestyleblock.remove();
        singlestyleblock = $("<style type='text/css'> .highlight {opacity: " + opacity + ";} </style>").appendTo("head");
        singlestyleblockopacity = opacity;
    };

    let downlightfct = function () {
        d3.selectAll(".node").filter(function () { return gSelectedNodes.indexOf(this.id) == -1; })
            .classed("downlight", false)
            .classed("highlight", false);
        d3.selectAll(".edge").filter(function () { return gSelectedNodes.indexOf(this.id) == -1; })
            .classed("downlight_edge", true)
            .classed("highlight", false);
    };

    let highlightsubtreefct = function (childid) {
        //find id in branches
        let child = null;
        for (let b = 0; b < branches.length; b++) {
            if (branches[b].nodes[branches[b].nodes.length - 1].id == childid) {
                child = b;
            }
        }

        if (child === null)
            console.log("did not find childid " + childid);

        //find all ancestor branches
        child = branches[child].parentBranch;
        while (child != -1) {
            highlightfct("id_" + branches[child].nodes[branches[child].nodes.length - 1].id + "_");
            child = branches[child].parentBranch;
        }
    };

    let mouseoverfct = function (d) {
        d3.selectAll(".node").filter(function () { return gSelectedNodes.indexOf(this.id) == -1; })
            .classed("downlight", true);
        let wholeid = d3.select(this).attr("id");
        console.log(wholeid)
        let splitid = wholeid.split('_');
        //let saddlenr = null;
        let id = wholeid;
        let idnr = splitid[1];
        if (splitid.length > 2) {
            id = "id_" + splitid[1] + "_";
            saddlenr = splitid[2];
        }

        highlightfct(wholeid);
        highlightsubtreefct(idnr);

        //get branch nr of this id -> get saddle count
        let branch = null;
        for (let b = 0; b < branches.length; b++) {
            if (branches[b].nodes[branches[b].nodes.length - 1].id == idnr) {
                branch = b;
                break;
            }
        }

        if (gSaddlecnt[branch] == 1) {
            d3.selectAll(".tree_rect[class*=" + id + "]").classed("tree_rect_downlight", false)
                .attr("fill", gEdgeidColor[id]);
            d3.selectAll(".tree_text[class*=" + id + "]").classed("tree_text_downlight", false)
                .classed("tree_text_highlight", true);
        }
        else {
            for (let s = 0; s < gSaddlecnt[branch]; s++) {
                d3.selectAll(".tree_rect." + id + s).classed("tree_rect_downlight", false)
                    .attr("fill", gEdgeidColor[id + s]);
                d3.selectAll(".tree_text." + id + s).classed("tree_text_downlight", false)
                    .classed("tree_text_highlight", true);
            }
        }

        //showimages(idnr);
    };

    let mouseoutfct = function (d) {
        downlightfct();
        d3.selectAll(".tree_rect").classed("tree_rect_downlight", true)
            .classed("tree_rect_highlight", false)
            .classed("tree_rect_selected", false);
        d3.selectAll(".tree_text").classed("tree_text_downlight", true)
            .classed("tree_text_highlight", false);
        $('.mask').hide();

        //re-show masks for all currently selected ids
        /*for (let i=0; i<gSelectedNodes.length; i++){
            let splitid = gSelectedNodes[i].split("_");
            showimages(splitid[1]);
        }*/
    };

    let clickfct = function (d) {
        let id = d3.select(this).attr("id");
        let index = gSelectedNodes.indexOf(id);
        if (index > -1) //node was selected, is now deselected
            gSelectedNodes.splice(index, 1);
        else
            gSelectedNodes.push(id);
    };

    let leavetreeboxfct = function (d) {
        mouseoutfct(d);

        //delete single tree
        d3.selectAll(".single").remove();

        //delete single-tree highlighting
        d3.selectAll(".highlight_separate_tree").classed("highlight_separate_tree", false);

        //re-highlight selected branches
        d3.selectAll(".node")
            .filter(function () { return gSelectedNodes.indexOf(this.id) != -1; }).classed("downlight", false)
            .classed("highlight", true);
        d3.selectAll(".edge")
            .filter(function () { return gSelectedNodes.indexOf(this.id) != -1; }).classed("downlight_edge", false)
            .classed("highlight", true);

        if (singlestyleblock !== null)
            singlestyleblock.remove();
        singlestyleblock = $("<style type='text/css'> .highlight {opacity: 1.0;} </style>").appendTo("head");
    };

    let highlightbytreefct = function (d) {
        //check if triggered by text or by box
        let id = d3.select(this).attr("id");
        let t = id.substr(10) - 1;
        let ids = null;
        if (id.startsWith("tree_text_")) {
            ids = d3.select("#tree_rect_" + id.substr(10)).attr("class").split(" ");
            console.log(ids)
            d3.select("#tree_rect_" + id.substr(10)).classed("tree_rect_selected", true);
            t = id.substr(10) - 1;
        } else {
            ids = d3.select(this).attr("class").split(" ");
            d3.select(this).classed("tree_rect_selected", true);
            console.log(ids)
        }

        //downlight all (also selected) branches
        d3.selectAll(".node").classed("downlight", true).classed("highlight", false);
        d3.selectAll(".edge").classed("downlight_edge", true).classed("highlight", false);

        //highlight whole branches behind with lower opacity
        for (let i = 0; i < ids.length; i++) {
            if (ids[i].startsWith("id"))
                highlightfct(ids[i], 0.4);
        }
        
        //draw single selected tree above the alignment
        //change edges to correct start and end
        let sedges = [];
        let sedgeids = [];
        let snodes = [];

        // gEdge_node_info: edge: [{tree: [saddle, leaf]}]

        for (let eid in gEdge_node_info) {
            //console.log("edge node info: ", gEdge_node_info[eid])
            // check if the selected tree plays a role in this edge
            if (t in gEdge_node_info[eid]) {
                snodes.push(gEdge_node_info[eid][t][1]); // leafnodes of all edges this tree plays a role in
                //snodes.push(gEdge_node_info[eid][t][0]); //saddlenodes. 
                //console.log("here are saddlenodes drawn!!!!!!")
                // get needed edges with this edgeid into sedges, that is the edge for the correct saddle and the edge connecting saddles with extrema
                let saddleedge = null;
                let longedge = null;

                if (layout == 'grouped') {

                    for (let e = 0; e < gEdgeids.length; e++) {
                        let edgeid = "id_" + gEdgeids[e][0] + "_";
                        if (gEdgeids[e][1] !== null)
                            edgeid += gEdgeids[e][1];

                        if (edgeid == eid) {
                            if (gGrouped_edges[e].length == 2) //main branch or saddle edge
                            {
                                if (gGrouped_edges[e][0][0] == gGrouped_edges[e][1][0]) //constant x values -> main branch
                                {
                                    longedge = gGrouped_edges[e].slice();
                                    longedge[longedge.length - 1][1] = gEdge_node_info[eid][t][1].y;
                                    saddleedge = [];
                                    snodes.push(gEdge_node_info[eid][t][0]);
                                }
                                else //saddle edge -> check if correct saddle
                                {
                                    if (gGrouped_edges[e][0][1] == gEdge_node_info[eid][t][0].y) //edge for correct saddle value in y of first point
                                    {
                                        saddleedge = gGrouped_edges[e].slice();
                                    }
                                }
                            }
                            else //long edge -> check if correct saddle
                            {
                                if (gGrouped_edges[e][0][1] == gEdge_node_info[eid][t][0].y) //edge for correct saddle value in y of first point
                                {
                                    longedge = gGrouped_edges[e].slice();
                                }
                            }
                        }
                        if (longedge !== null && saddleedge !== null) {
                            sedges.push(saddleedge);
                            sedges.push(longedge);
                            sedgeids.push(gEdgeids[e]);
                            sedgeids.push(gEdgeids[e]);
                            break;
                        }
                        else if (saddleedge !== null && gEdgeids[e][1] !== null) //two part ids are only given to saddleedges
                        {
                            sedges.push(saddleedge);
                            sedgeids.push(gEdgeids[e]);
                            break;
                        }
                    }

                } else if (layout == 'bundle') {
                    // find all edges in gEdgeids that have id eid
                    for (let e = 0; e < gEdgeids.length; e++) {

                        let edgeid = "id_" + gEdgeids[e][0] + "_";

                        if (gEdgeids[e][1] !== null) {
                            edgeid += gEdgeids[e][1];
                        }
                        if (edgeid == eid) {
                            if (gBundled_edges[e].length == 2) { // main branch                            
                                //longedge = gBundled_edges[e].slice();
                                //console.log("bundled edge: ", gEdgeids.length)
                                //console.log("edgeid: ", edgeid)
                                longedge = JSON.parse(JSON.stringify(gBundled_edges[e])); // deep copy (wtf js)
                                longedge[longedge.length - 1][1] = gEdge_node_info[eid][t][1].y;
                                saddleedge = [];
                                snodes.push(gEdge_node_info[eid][t][0]);

                                console.log("longedge:", longedge)
                                console.log("saddleedge:", saddleedge)

                                test1 = longedge[0];
                                test2 = longedge[1];

                            } else if (saddleedge === null && gBundled_edges[e].length == 5) { // bundle edge -> check if correct saddle
                                if (gBundled_edges[e][0][1] == gEdge_node_info[eid][t][0].y) { // edge for correct saddle value in y of first point
                                    saddleedge = gBundled_edges[e].slice();
                                }
                            } else if (longedge === null && gBundled_edges[e].length == 4) { // long edge -> take the first one
                                longedge = JSON.parse(JSON.stringify(gBundled_edges[e])); // deep copy (wtf js)
                                longedge[longedge.length - 1][1] = gEdge_node_info[eid][t][1].y;
                            }
                        }

                        if (longedge !== null && saddleedge !== null) {
                            /*console.log("I'm here")
                            console.log("longedge:", longedge)
                            console.log("saddleedge:", saddleedge)
                            console.log("            ")*/
                            sedges.push(saddleedge);
                            sedges.push(longedge);
                            sedgeids.push(gEdgeids[e]);
                            sedgeids.push(gEdgeids[e]);
                            break;
                        } else if (saddleedge !== null && gEdgeids[e][1] !== null) { //two part ids are only given to saddleedges
                            sedges.push(saddleedge);
                            sedgeids.push(gEdgeids[e]);
                            break;
                        }
                    }
                }                
            }            
        }

        console.log("len snodes: ", snodes.length)


        /*svg.append("line")
            .attr("x1", test1[0])
            .attr("y1", test1[1])
            .attr("x2", test2[0])
            .attr("y2", test2[1])
            .attr("stroke", "black")*/

        svg.selectAll("edges_tree" + t)
            .data(sedges)
            .enter()
            .append("path")
            .attr('d', function (d, i) { return curLineGenerator(d, sedgeids[i][0]); })
            .attr("stroke-width", Math.max(1, gEdgewidth - 4))
            .attr('fill', 'none')
            .attr("class", "edge")
            .classed("single", true)
            .attr("id", function (d, i) { if (sedgeids[i][1] === null) return "id_" + sedgeids[i][0] + "_"; else return "id_" + sedgeids[i][0] + "_" + sedgeids[i][1]; });


        svg.selectAll("node_tree" + t)
            .data(snodes)
            .enter()
            .append("circle")
            .attr("cx",
                function (d) {
                    return (d.x);
                })
            .attr("cy",
                function (d, i) {
                    if (yshift)
                        return (d.y + gEdge_offsets[d.id]);
                    else
                        return (d.y);
                })
            .attr("r", gNodewidth)
            .attr("class", "node")
            .classed("single", true)
            .attr("id", function (d) {
                if (!("root_id" in d))
                    return "id_" + d.id + "_";
                else
                    return "id_" + d.root_id + "_";
            });

    };


    d3.selectAll(".node")
        .on('mouseover', mouseoverfct)
        .on('mouseout', mouseoutfct)
        .on('click', clickfct);;

    d3.selectAll(".edge_alignment")
        .on('mouseover', mouseoverfct)
        .on('mouseout', mouseoutfct)
        .on('click', clickfct);

    d3.selectAll(".tree_box")
        .on('mouseover', highlightbytreefct)
        .on('mouseout', leavetreeboxfct);

    d3.selectAll(".beak")
        .on('mouseover', mouseoverfct)
        .on('mouseout', mouseoutfct)
        .on('click', clickfct);

    function createColors(edgeids) {
        //create css colors for all components
        //get unique values from edgeids array, use the fact that edgeids are in blocks
        var uedgeids = [edgeids[0]];
        for (let eid = 1; eid < edgeids.length; eid++) {
            if (uedgeids[uedgeids.length - 1][0] != edgeids[eid][0]) //first entry comes in blocks
                uedgeids.push(edgeids[eid]);
            else {
                let i = 1;
                let found = false;
                while (i < uedgeids.length && uedgeids[uedgeids.length - i][0] == edgeids[eid][0]) {
                    if (uedgeids[uedgeids.length - i][1] === edgeids[eid][1]) {
                        found = true;
                        break;
                    }
                    i++;
                }
                if (!found)
                    uedgeids.push(edgeids[eid]);
            }
        }
        let color10 = d3.scaleOrdinal(d3.schemeCategory10);
        let color = d3.scaleSequential()
            .domain([0, uedgeids.length / 1.5])
            .interpolator(d3.interpolateRainbow);//d3.interpolateTurbo);
        for (let eid = 0; eid < uedgeids.length; eid++) {
            let id = uedgeids[eid][0];
            let snr = uedgeids[eid][1];
            let cssid = "id_" + id + "_";
            let maincolor = null;
            let maincolorid = null;
            if (maincolorid !== uedgeids[eid][0]) {
                maincolor = color(eid);
                maincolorid = uedgeids[eid][0];
            }
            let curcolor = maincolor;

            if (snr !== null) {
                cssid += snr;
                if (snr !== gMainsaddle[uedgeids[eid][0]]) {
                    curcolor = color(eid);
                }
            }
            gEdgeidColor[cssid] = curcolor;

            let styleblock = $("<style type='text/css'></style>");
            let style = ".edge#" + cssid + "{stroke: " + curcolor + ";} .node#" + cssid + "{fill: " + curcolor + ";}";
            style += ".tree_rect_highlight#" + cssid + " {fill: " + curcolor + ";}";

            let sids = alignment.nodes[id].segmentationIDs;
            for (let t = 0; t < sids.length; t++) {
                if (sids[t] != -1) {
                    if (snr === null)
                        style += "#tree" + t + "_mask" + sids[t] + "{background-color: " + curcolor + ";}";
                    else { //find uedgeids[eid] in the ids of this tree
                        let found = false;
                        for (let i = 0; i < gTrees_edges[t].length; i++)
                            if (gTrees_edges[t].indexOf("id_" + id + "_" + snr) > -1)
                                style += "#tree" + t + "_mask" + sids[t] + "{background-color: " + curcolor + ";}";
                    }
                }
            }
            if (id == gRootbranchid) {
                sids = alignment.nodes[gRootid].segmentationIDs;
                for (let t = 0; t < sids.length; t++) {
                    if (sids[t] != -1) {
                        style += "#tree" + t + "_mask" + sids[t] + "{background-color: " + curcolor + ";}";
                    }
                }
            }

            styleblock.text(style);
            styleblock.appendTo("head");
        }
    }

    createColors(gEdgeids)
    
    })
}