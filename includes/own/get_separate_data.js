function getSeparateData(trees, svgwidth, svgheight, nodes, edges, edgeids)
{ //gets the data for drawing of the separate trees
  //layout is done individually for each tree, simple random left/right decision with step size dependent on depth
  
	let miniso = null;
	let maxiso = null;

	function getNodeByID(tree, id){
		//currently just runs through list, if list is sorted use binary search
		let i = 0;
		while (i<tree.nodes.length && tree.nodes[i].id != id)
			i++;
		if (i == tree.nodes.length)
			return null;
		return tree.nodes[i];
	}

	function getyfromscalar(scalar)
	{
		return svgheight - (scalar-miniso)/(maxiso-miniso)*svgheight*0.8-0.1*svgheight;
	}

	function findPath(tree, start, stop, mode=null, path=[], touched=[])
	{ //start and stop are pointer to start and stop node of the tree
		path.push(start);
		touched[start.id] = true;
		let edgestodo = [];
		if (mode=="up" || mode === null)
		{
			for (let e=0; e<start.upEdgeIDs.length; e++)
				edgestodo.push(tree.edges[start.upEdgeIDs[e]]);
		}
		if (mode=="down" || mode === null)
		{
			for (let e=0; e<start.downEdgeIDs.length; e++)
				edgestodo.push(tree.edges[start.downEdgeIDs[e]]);
		}

		while (edgestodo.length > 0)
		{
			let e = edgestodo.pop();
			let n = getNodeByID(tree, e.node1);
			if (n.id == start.id)
				n = getNodeByID(tree, e.node2);

			if ("fixed" in getNodeByID(tree, n.id))
			{
				continue;
			}

			if (n.id == stop.id)
			{
				path.push(stop);
				return path;
			}
			if (!touched[n.id])
			{
				let foundpath = findPath(tree, n, stop, mode, path.slice(), touched);
				if (foundpath !== null)
					return foundpath;
			}
		}

		return null;
	}

	function findMainBranch(tree, rootnode)
	{
		let mainPath = [];
		let mainPathMode = null;
		let maxPersistence = null;

		for (let n=0; n<tree.nodes.length; n++)
		{
			if (tree.nodes[n].id == rootnode.id || "fixed" in tree.nodes[n])
			{
				continue;
			}
			let uppath = findPath(tree, rootnode, tree.nodes[n], "up");
			let downpath = findPath(tree, rootnode, tree.nodes[n], "down");

			if (uppath !== null && Math.abs(uppath[0].scalar - uppath[uppath.length-1].scalar) > maxPersistence)
			{
				mainPath = uppath;
				mainPathMode = "up";
				maxPersistence = Math.abs(uppath[0].scalar - uppath[uppath.length-1].scalar);
			}
			if (downpath !== null && Math.abs(downpath[0].scalar - downpath[downpath.length-1].scalar) > maxPersistence)
			{
				mainPath = downpath;
				mainPathMode = "down";
				maxPersistence = Math.abs(downpath[0].scalar - downpath[downpath.length-1].scalar);
			}
		}
		return [mainPath, mainPathMode];
	}

	function getBranchDecomposition(tree)
	{
		let branches = [];

		//root node: the one with minimum isovalue
		miniso = tree.nodes[0].scalar;
		let rootnode = tree.nodes[0];
		for (let n=1; n<tree.nodes.length; n++)
		{	
			if (miniso > tree.nodes[n].scalar)
			{
				miniso = tree.nodes[n].scalar;
				rootnode = tree.nodes[n];
			}
		}

		let startnodes = [[rootnode,-1]];

		while (startnodes.length !== 0)
		{
			let start = startnodes.pop();
			let startnode = start[0];
			let startparent = start[1];

			//find main branch starting from current startnode
			let mainpath = findMainBranch(tree, startnode);
			let branchid = branches.length;

			if (startparent != -1)
				branches.push({"parentBranch": startparent,  "nodes": mainpath[0], "mode": mainpath[1], "id": branchid, "depth": branches[startparent].depth+1});
			else
				branches.push({"parentBranch": startparent,  "nodes": mainpath[0], "mode": mainpath[1], "id": branchid, "depth": 0});

			//mark nodes as fixed
			for (let n=0; n<mainpath[0].length; n++)
			{
				mainpath[0][n].fixed = true;
				//all saddles on this path are potential new start points
				if (n>0 && n<mainpath[0].length-1)
					startnodes.push([mainpath[0][n], branchid]);
			}
		}

		return branches;
	}

	//layout each branch separately and return nodes/edges/edgeids for them
	for (let t=0; t<trees.length; t++)
	{
		let branches = getBranchDecomposition(trees[t]);

		//remove "fixed" from all nodes, this disturbs later
		for (let n=0; n<trees[t].nodes.length; n++)
			delete trees[t].nodes[n].fixed;

		//get maxiso (miniso is filled by getbranchDecomposition)
		maxiso = trees[t].nodes[0].scalar;
		for (let n=1; n<trees[t].nodes.length; n++)
		{
			if (maxiso < trees[t].nodes[n].scalar)
				maxiso = trees[t].nodes[n].scalar;
		}
		
		//assign percent y values to the nodes based on branch decomposition
		//mainbranch is always centered at 50%
		let wackelfaktor = 0.4;
		for (let b=0; b<branches.length; b++)
		{
			let x_percent = 50;
			if (branches[b].depth !== 0)
			{
				if(Math.random() > 0.5) //right node
				{
					x_percent = branches[branches[b].parentBranch].x_percent + 100/(Math.pow(2,branches[b].depth+1) * (1.0 + (2*Math.random()-1.0) * wackelfaktor));
				}
				else //left node
				{
					x_percent = branches[branches[b].parentBranch].x_percent - 100/(Math.pow(2,branches[b].depth+1) * (1.0 + (2*Math.random()-1.0) * wackelfaktor));
				}
				x_percent = Math.min(100, Math.max(0, x_percent));
			}

			branches[b].x_percent = x_percent;
		}

		//assign x and y values and fill node array
		for (let b=0; b<branches.length; b++)
		{
			//console.log("test for noels tree:", branches[b].nodes.length);

			if(branches[b].nodes.length == 0){
				continue;
			}
			for (let n=0; n<branches[b].nodes.length; n++)
			{
				//dont store anything in the trees, it will be changed later
				if (b===0 || n > 0)
				{
					if (branches[b].nodes[n].upEdgeIDs.length + branches[b].nodes[n].downEdgeIDs.length == 1)
						nodes.push([t, branches[b].nodes[n].id, branches[b].x_percent/100*svgwidth*0.8+svgwidth*0.1, getyfromscalar(branches[b].nodes[n].scalar)]);
				}
			}
			let saddlecoords = null;
			if (branches[b].parentBranch > -1)
				saddlecoords = [branches[branches[b].parentBranch].x_percent/100*svgwidth*0.8+svgwidth*0.1, getyfromscalar(branches[b].nodes[0].scalar)];
			else
				saddlecoords = [branches[b].x_percent/100*svgwidth*0.8+svgwidth*0.1, getyfromscalar(branches[b].nodes[0].scalar)];
			let leafcoords = [branches[b].x_percent/100*svgwidth*0.8+svgwidth*0.1, getyfromscalar(branches[b].nodes[branches[b].nodes.length-1].scalar)];

			edges.push([[saddlecoords[0], saddlecoords[1]], [leafcoords[0], saddlecoords[1]], [leafcoords[0], leafcoords[1]]]);
			edgeids.push([t, branches[b].nodes[branches[b].nodes.length-1].id]);
		}
	}
}