import numpy as np
import nrrd

# read the data back from file
readdata, options = nrrd.read( '0.00.nrrd' )
print readdata.shape
print options
