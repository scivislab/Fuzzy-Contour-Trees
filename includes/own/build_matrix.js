/**
 * Creates the grid containing contour tree numbers with appropriate css classes
 * gets the array of trees, the id of the div where the svg to draw should be created and the trees_edges linking containing for every tree a list of css edgeids that are contained
 */

function buildMatrix(trees, div_id, trees_edges)
{
  let width = $("#"+div_id).width();
  let blocksize = 50;


 //create svg for drawing in given div
  let svg = null

  if (d3.select("#"+div_id+" #matrixsvg").size() === 0)
  {
    svg = d3.select("#"+div_id)
    .append("svg")
    .attr("width", width)
    .attr("height", blocksize)
    .attr("id","matrixsvg");
  }
  else
  {
    //clear the svg
    d3.select("#"+div_id+" #matrixsvg").selectAll("*").remove();
    svg = d3.select("#"+div_id+" #matrixsvg");
  }


  //create data from trees
  let data = []; //row, col, treeid, leafids
  let n = Math.floor(width/blocksize);
  for (let t=0; t<trees.length; t++)
  {
    data.push([Math.floor(t/n), t%n, t+1, trees_edges[t]]);
  }

  let domain = Array.from(Array(n).keys());

  let x = d3.scaleBand()
    .range([ 0, width ])
    .domain(domain)
    .padding(0.01);

  //Draw
  svg.selectAll("rect")
      .data(data)
      .enter()
      .append("rect")
      .attr("x", function(d) { return x(d[1]); })
      .attr("y", function(d) { return x(d[0]); })
      .attr("width", x.bandwidth() )
      .attr("height", x.bandwidth() )
      .attr("class", function(d) {return d[3].join(" ");})
      .classed("tree_rect", true)
      .classed("tree_rect_downlight", true)
      .classed("tree_box", true)
      .attr("id", function(d) {return "tree_rect_"+d[2];});

  svg.selectAll("recttext")
      .data(data)
      .enter()
      .append("text")
      .attr("x", function(d) { return x(d[1]) + x.bandwidth()*0.5; })
      .attr("y", function(d) { return x(d[0]) + x.bandwidth()*0.5; })
      .text(function(d) {return d[2]} )
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .attr("font-family", "sans-serif")
      .attr("font-size", "20px")
      .attr("class", function(d) {return d[3].join(" ");})
      .classed("tree_text", true)
      .classed("tree_text_downlight", true)
      .classed("tree_box", true)
      .attr("id", function(d) {return "tree_text_"+d[2];});
}