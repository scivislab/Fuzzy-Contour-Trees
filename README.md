# The Fuzzy Contour Tree Tool

This is an implementation of the **Fuzzy Contour Tree** tool. 
For further information on Fuzzy Contour Trees, see *https://onlinelibrary.wiley.com/doi/full/10.1111/cgf.13985*.

The tool is implemented as a **Jupyter Notebook**, which also uses a **ParaView/TTK** environment. The needed environment is provided by a **docker container**.

## Get Started
1. Download, install and start **Docker Desktop**. For instructions see *https://www.docker.com/products/docker-desktop*.
2. Download this project.
3. Pull the docker container for the environment at *https://hub.docker.com/r/chgarth/paraview-notebook-ttk*:
    - *docker pull chgarth/paraview-notebook-ttk*
4. Run the docker container:
    - *docker run -it --rm -p 8888:8888 -v "<path to 'fct-rollout' directory>:/home/" chgarth/paraview-notebook-ttk:latest jupyter notebook --allow-root*
5. Open the indicated URL in your browser, go to the *home* directoy and open the Jupyter Notebook file. 
6. Run all cells to see an example Fuzzy Contour Tree.
