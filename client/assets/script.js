$(function () {
    // create shortcut for showing modals
    $.fn.showModal = function(title, body) {
        $(this).find('.modal-title').text(title);
        $(this).find('.modal-body').text(body);
        $(this).modal('show');
    }

    // initialize custom bootstrap file inputs
    bsCustomFileInput.init();

    // show form submission results in a modal instead of a new page
    $('[onsubmit-modal]').submit(function (ev) {
        ev.preventDefault();
        var form = ev.target;
        var $submitModal = $(form.getAttribute('onsubmit-modal'));
        $submitModal.showModal('Please Wait', 'Submitting request...');
        
        $.ajax({
            type: 'POST',
            url: form.action,
            data: new FormData(form),
            contentType: false,
            processData: false,
            success: function(data) {
                $submitModal.showModal('Request Submitted', data);
            },
            error: function(jqXHR) {
                $submitModal.showModal('Error', jqXHR.responseText);
            }
          });
    });

    // initialize job status table
    $.getJSON('status', function(data) {
        console.log('data', data);
        
        $('#job-status-table').dataTable({
            data: data,
            columns: [
                {
                    data: 'status',
                    title: 'Status',
                },
                {
                    data: 'inputKey',
                    title: 'Input Key',
                },
                {
                    data: 'outputKey',
                    title: 'Output Key',
                },
                {
                    data: 'elapsedTime',
                    title: 'Elapsed Time (s)',
                },
                {
                    data: 'fileSize',
                    title: 'File Size',
                    render: function(data, type, row) {
                        if (type !== 'display' && type !== 'filter')
                            return data;
                        if (data < 1024) {
                            return (+data) + ' b';
                        } else if (data < 1024 * 1024) {
                            return (+data/1024).toFixed(2) + ' KiB';
                        } else if (data < 1024 * 1024 * 1024) {
                            return (+data/1024/1024).toFixed(2) + ' MiB';
                        } else {
                            return (+data/1024/1024/1024).toFixed(2) + ' GiB';
                        }
                    }
                },
                {
                    data: 'convertedAt',
                    title: 'Converted At',
                },
            ],
            dom: "<'row'<'col-sm-12 col-md-6'l><'col-sm-12 col-md-6'f>>" +
            "<'table-responsive mb-3'tr>" +
            "<'row'<'col-sm-12 col-md-5'i><'col-sm-12 col-md-7'p>>",
        })
        $('#status').DataTable();
    })

});
